#!/usr/bin/env bash
# =============================================================
# Novel Smith — git 快照 / 回滚工具
# -------------------------------------------------------------
# 干什么用：每次改代码前拍一张"快照"，改坏了可以一键回到拍快照那刻。
# 快照包含两样东西：
#   1) 已入库文件 —— 用 git 标签（tag）钉死，零成本、秒级
#   2) 未入库文件 —— 用 tar 包存起来（git 标签管不到没 add 过的文件）
#   另外再存一份 git bundle（整个仓库的全量压缩包），
#   即使 .git 目录被删也能从 bundle 完整还原。
#
# 用法：
#   ./scripts/git-snapshot.sh create "这次要改什么的说明"
#   ./scripts/git-snapshot.sh list
#   ./scripts/git-snapshot.sh restore <标签名>            # 安全模式：开新分支，不动 main
#   ./scripts/git-snapshot.sh restore <标签名> --hard     # 硬模式：直接把当前分支拉回去
#   ./scripts/git-snapshot.sh verify <标签名>             # 检查快照是否完好
# =============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SNAP_DIR=".snapshots"
AGENT_MD="agent.md"

# ---------- 小工具 ----------
now() { date +%Y%m%d-%H%M%S; }
cur_ver() {
  node -p "require('./package.json').version" 2>/dev/null || echo "unknown"
}
cur_branch() {
  git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}
die() { echo "错误：$1" >&2; exit 1; }

usage() {
  cat <<'EOF'
用法：
  git-snapshot.sh create "说明"                建快照（推荐每次改代码前跑一次）
  git-snapshot.sh list                        列出所有快照
  git-snapshot.sh restore <标签>              安全回滚：新建 restore/ 分支，main 不受影响
  git-snapshot.sh restore <标签> --hard       硬回滚：当前分支直接退回到快照点
  git-snapshot.sh verify  <标签>              验证快照完整性
EOF
}

# ---------- create：建快照 ----------
cmd_create() {
  local msg="${1:-手动快照}"
  local ts ver tag br utar ustat bundle zlist

  ts="$(now)"
  ver="$(cur_ver)"
  br="$(cur_branch)"
  tag="snap/${ts}-v${ver}"

  git rev-parse -q --verify "refs/tags/${tag}" >/dev/null \
    && die "同名快照已存在：${tag}（同一秒内不能建两个，等 1 秒再试）"

  mkdir -p "$SNAP_DIR"

  # 1) 未跟踪文件：git 标签管不到，单独打包
  #    用 -z（NUL 分隔）+ tar --null：中文路径不会被 git 转义成 "\344\274\232" 这种
  #    八进制字面量（转义后 tar 会找不到文件而静默失败）。
  utar=""
  ustat="无（该时刻没有未跟踪文件）"
  local zlist="${SNAP_DIR}/${ts}-untracked.zlist"
  if git ls-files --others --exclude-standard -z > "$zlist" 2>/dev/null && [ -s "$zlist" ]; then
    if tar --null -czf "${SNAP_DIR}/${ts}-untracked.tar.gz" -T "$zlist" 2>/dev/null; then
      utar="${SNAP_DIR}/${ts}-untracked.tar.gz"
      ustat="$utar"
    else
      ustat="打包失败！请手动备份（见 ${zlist}）"
      echo "警告：未入库文件打包失败，这些文件不会被快照保护" >&2
    fi
  fi

  # 2) 打注释标签（钉死已入库文件）
  git tag -a "$tag" -m "$msg"

  # 3) 全量 bundle（.git 被删也能还原）
  bundle="${SNAP_DIR}/${ts}.bundle"
  git bundle create "$bundle" --all >/dev/null 2>&1 || die "bundle 创建失败"

  local bsize usize
  bsize="$(du -h "$bundle" 2>/dev/null | cut -f1)"
  usize="$( [ -n "$utar" ] && du -h "$utar" 2>/dev/null | cut -f1 || echo "-")"
  [ -n "$utar" ] && ustat="${utar}（${usize}）"

  # 4) 往 agent.md 的快照索引里插一行（文件不存在就跳过，不打断主流程）
  if [ -f "$AGENT_MD" ]; then
    printf '| `%s` | %s | v%s | %s | %s | %s |\n' \
      "$tag" "$(date '+%Y-%m-%d %H:%M')" "$ver" "$br" "$msg" "$bsize" \
      >> "$AGENT_MD"
  fi

  cat <<EOF

  快照建好了
  --------------------------------------------------
  标签      ${tag}
  版本      v${ver}  分支 ${br}
  说明      ${msg}
  已入库    ${bundle}（${bsize}）
  未入库    ${ustat}

  以后要回到这一刻：
    ./scripts/git-snapshot.sh restore ${tag}
EOF
}

# ---------- list：列快照 ----------
cmd_list() {
  local tags
  tags="$(git tag -l 'snap/*' --sort=-creatordate 2>/dev/null)"
  [ -z "$tags" ] && { echo "还没有任何快照。先跑：git-snapshot.sh create \"说明\""; return 0; }

  printf '%-40s %-18s %-10s %s\n' "标签" "时间" "提交" "说明"
  printf '%s\n' "--------------------------------------------------------------------------------"
  while IFS= read -r t; do
    local d s m
    d="$(git log -1 --format=%ci "$t" 2>/dev/null | cut -c1-16)"
    # ^{commit} 取标签真正指向的提交；不加的话拿到的是标签对象自身的哈希，会误导
    s="$(git rev-parse --short "${t}^{commit}" 2>/dev/null)"
    m="$(git tag -l --format='%(contents:subject)' "$t" 2>/dev/null)"
    printf '%-40s %-18s %-10s %s\n' "$t" "$d" "$s" "$m"
  done <<< "$tags"
  echo
  echo "bundle 备份目录：${SNAP_DIR}/（共 $(ls -1 "${SNAP_DIR}"/*.bundle 2>/dev/null | wc -l) 个）"
}

# ---------- restore：回滚 ----------
cmd_restore() {
  local tag="${1:-}" mode="${2:---safe}"
  [ -z "$tag" ] && { usage; die "缺标签名"; }
  git rev-parse -q --verify "refs/tags/${tag}" >/dev/null || die "找不到快照：${tag}"

  if [ "$mode" = "--hard" ]; then
    echo "即将硬回滚当前分支到 ${tag}"
    echo "  当前未提交的改动会全部丢失。"
    read -r -p "  确认请输入 yes： " ans
    [ "$ans" = "yes" ] || { echo "已取消。"; exit 0; }
    git reset --hard "$tag"
    echo "已回滚到 ${tag}（当前分支指针已移动）"
  else
    local nb="restore/${tag#snap/}"
    git checkout -b "$nb" "$tag" 2>/dev/null || git checkout "$nb"
    cat <<EOF

  已开恢复分支：${nb}
  main 分支原样没动，你现在就在这个分支上，随便看随便测。

  确认没问题、想让 main 也回到这一刻：
    git checkout main && git reset --hard ${tag}

  不想要了、回 main：
    git checkout main && git branch -D ${nb}
EOF
  fi

  # 提示未入库文件的还原方式
  local ts tarf
  ts="$(echo "$tag" | sed 's#^snap/##; s#-v.*$##')"
  tarf="${SNAP_DIR}/${ts}-untracked.tar.gz"
  [ -f "$tarf" ] && echo "  这个快照还带了未入库文件包：${tarf}（需要时 tar -xzf 解回仓库根目录）"
}

# ---------- verify：验完整性 ----------
cmd_verify() {
  local tag="${1:-}"
  [ -z "$tag" ] && { usage; die "缺标签名"; }
  local ts bundle
  ts="$(echo "$tag" | sed 's#^snap/##; s#-v.*$##')"
  bundle="${SNAP_DIR}/${ts}.bundle"

  git rev-parse -q --verify "refs/tags/${tag}" >/dev/null || die "找不到标签：${tag}"
  echo "标签     ${tag}  存在"
  echo "提交     $(git rev-parse --short "${tag}^{commit}")  $(git log -1 --format=%s "$tag")"

  if [ -f "$bundle" ]; then
    if git bundle verify "$bundle" >/dev/null 2>&1; then
      echo "bundle   ${bundle}  完好（可独立还原整个仓库）"
    else
      echo "bundle   ${bundle}  损坏！" >&2
    fi
  else
    echo "bundle   缺失（${bundle}）"
  fi
  [ -f "${SNAP_DIR}/${ts}-untracked.tar.gz" ] \
    && echo "未入库包 ${SNAP_DIR}/${ts}-untracked.tar.gz  存在" \
    || echo "未入库包 无（该快照时没有未跟踪文件）"
}

case "${1:-}" in
  create)  shift; cmd_create "$@" ;;
  list)    cmd_list ;;
  restore) shift; cmd_restore "$@" ;;
  verify)  shift; cmd_verify "$@" ;;
  *)       usage ;;
esac
