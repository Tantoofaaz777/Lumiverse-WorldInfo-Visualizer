$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'spindle.json') -Raw | ConvertFrom-Json
$taskOutput = Join-Path $taskRoot 'artifacts'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskFiles = @('spindle.json', 'dist', 'src', 'package.json', 'bun.lock', 'tsconfig.json', 'README.md', 'THIRD_PARTY_NOTICES.md') | ForEach-Object { Join-Path $taskRoot $_ }
$taskArchive = Join-Path $taskOutput ("world-info-visualizer-" + $taskManifest.version + '.zip')
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskStream = [System.IO.File]::Open($taskArchive, [System.IO.FileMode]::Create)
$taskZip = [System.IO.Compression.ZipArchive]::new($taskStream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($taskPath in $taskFiles) {
        $taskItem = Get-Item -LiteralPath $taskPath
        $taskItems = if ($taskItem.PSIsContainer) { Get-ChildItem -LiteralPath $taskPath -File -Recurse } else { @($taskItem) }
        foreach ($taskFile in $taskItems) {
            $taskEntry = $taskFile.FullName.Substring($taskRoot.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskZip, $taskFile.FullName, $taskEntry) | Out-Null
        }
    }
} finally {
    $taskZip.Dispose()
    $taskStream.Dispose()
}
Write-Output $taskArchive
