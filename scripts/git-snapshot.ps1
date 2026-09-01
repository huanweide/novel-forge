# =============================================================
# Novel Smith — git 快照 / 回滚工具（PowerShell 版）
# 和 scripts/git-snapshot.sh 功能一致，给 PowerShell 环境用。
#
#   .\scripts\git-snapshot.ps1 create "说明"
#   .\scripts\git-snapshot.ps1 list
#   .\scripts\git-snapshot.ps1 restore <标签>
#   .\scripts\git-snapshot.ps1 restore <标签> -Hard
#   .\scripts\git-snapshot.ps1 verify  <标签>
# =============================================================

param(
    [Parameter(Position = 0)]
    [ValidateSet('create', 'list', 'restore', 'verify')]
    [string]$Command = 'list',
    [Parameter(Position = 1)]
    [string]$Arg,
    [Parameter(Position = 2)]
    [string]$Extra,
    [switch]$Hard
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
$SnapDir = '.snapshots'

function Get-Version {
    try { (Get-Content (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json).version }
    catch { 'unknown' }
}

function New-Snapshot([string]$Message) {
    if (-not $Message) { $Message = '手动快照' }
    $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
    $ver = Get-Version
    $tag = "snap/$ts-v$ver"

    if (git rev-parse -q --verify "refs/tags/$tag" 2>$null) {
        throw "同名快照已存在：$tag（同一秒内不能建两个）"
    }

    if (-not (Test-Path $SnapDir)) { New-Item -ItemType Directory -Path $SnapDir | Out-Null }

    # 未跟踪文件单独打包
    $untracked = git ls-files --others --exclude-standard
    $utar = $null
    $ustat = '无（该时刻没有未跟踪文件）'
    if ($untracked) {
        $listFile = Join-Path $SnapDir "$ts-untracked.list"
        $untracked | Set-Content -Encoding UTF8 $listFile
        $utar = Join-Path $SnapDir "$ts-untracked.tar.gz"
        tar -czf $utar -T $listFile 2>$null
        if ($LASTEXITCODE -eq 0) {
            $ustat = $utar
        }
        else {
            $ustat = "打包失败！请手动备份（见 $listFile）"
            Write-Warning '未入库文件打包失败，这些文件不会被快照保护'
            $utar = $null
        }
    }

    git tag -a $tag -m $Message

    $bundle = Join-Path $SnapDir "$ts.bundle"
    git bundle create $bundle --all 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'bundle 创建失败' }

    $bsize = '{0:N1} MB' -f ((Get-Item $bundle).Length / 1MB)

    if (Test-Path 'agent.md') {
        $br = (git rev-parse --abbrev-ref HEAD).Trim()
        $line = "| ``$tag`` | $(Get-Date -Format 'yyyy-MM-dd HH:mm') | v$ver | $br | $Message | $bsize |"
        Add-Content -Path 'agent.md' -Value $line -Encoding UTF8
    }

    Write-Output ""
    Write-Output "  快照建好了"
    Write-Output "  --------------------------------------------------"
    Write-Output "  标签      $tag"
    Write-Output "  版本      v$ver"
    Write-Output "  说明      $Message"
    Write-Output "  已入库    $bundle ($bsize)"
    Write-Output "  未入库    $ustat"
    Write-Output ""
    Write-Output "  回滚命令：  .\scripts\git-snapshot.ps1 restore $tag"
}

function Show-List {
    $tags = git tag -l 'snap/*' --sort=-creatordate
    if (-not $tags) { Write-Output '还没有任何快照。'; return }
    Write-Output ('{0,-40} {1,-18} {2,-10} {3}' -f '标签', '时间', '提交', '说明')
    Write-Output ('-' * 90)
    foreach ($t in $tags) {
        $d = (git log -1 --format=%ci $t).Substring(0, 16)
        # ^{commit} 取标签真正指向的提交；不加会拿到标签对象自身的哈希，会误导
        $s = git rev-parse --short "$t^{commit}"
        $m = git tag -l --format='%(contents:subject)' $t
        Write-Output ('{0,-40} {1,-18} {2,-10} {3}' -f $t, $d, $s, $m)
    }
}

function Restore-Snapshot([string]$Tag, [bool]$IsHard) {
    if (-not $Tag) { throw '缺标签名' }
    git rev-parse -q --verify "refs/tags/$Tag" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "找不到快照：$Tag" }

    if ($IsHard) {
        $ans = Read-Host "即将硬回滚到 $Tag，未提交改动会全部丢失。确认请输入 yes"
        if ($ans -ne 'yes') { Write-Output '已取消。'; return }
        git reset --hard $Tag
        Write-Output "已回滚到 $Tag"
    }
    else {
        $nb = "restore/" + $Tag.Substring(5)
        git checkout -b $nb $Tag 2>$null
        if ($LASTEXITCODE -ne 0) { git checkout $nb }
        Write-Output ""
        Write-Output "  已开恢复分支：$nb （main 原样没动）"
        Write-Output "  确认后让 main 也回去： git checkout main; git reset --hard $Tag"
        Write-Output "  不想要了：             git checkout main; git branch -D $nb"
    }
}

function Test-Snapshot([string]$Tag) {
    if (-not $Tag) { throw '缺标签名' }
    $ts = ($Tag -replace '^snap/', '') -replace '-v.*$', ''
    $bundle = Join-Path $SnapDir "$ts.bundle"
    git rev-parse -q --verify "refs/tags/$Tag" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "找不到标签：$Tag" }
    Write-Output "标签      $Tag  存在"
    Write-Output "提交      $(git rev-parse --short "$Tag^{commit}")  $(git log -1 --format=%s $Tag)"
    if (Test-Path $bundle) {
        git bundle verify $bundle 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Output "bundle    $bundle  完好" }
        else { Write-Output "bundle    $bundle  损坏！" }
    }
    else { Write-Output "bundle    缺失" }
    $u = Join-Path $SnapDir "$ts-untracked.tar.gz"
    if (Test-Path $u) { Write-Output "未入库包  $u  存在" } else { Write-Output '未入库包  无' }
}

switch ($Command) {
    'create' { New-Snapshot $Arg }
    'list' { Show-List }
    'restore' { Restore-Snapshot $Arg $Hard }
    'verify' { Test-Snapshot $Arg }
}
