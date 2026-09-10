[CmdletBinding()]
param(
    [string]$OutputDirectory,
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'canvas-weekly.config.json'),
    [switch]$ShowOnly
)

$ErrorActionPreference = 'Stop'
$config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json

# Precedence: command argument, saved config, Windows Desktop known folder.
# The known folder accounts for Desktop redirection (including OneDrive).
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = $config.outputDirectory
}
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $desktopDirectory = [Environment]::GetFolderPath('DesktopDirectory')
    if ([string]::IsNullOrWhiteSpace($desktopDirectory)) {
        throw 'Windows Desktop could not be resolved. Supply -OutputDirectory.'
    }
    $OutputDirectory = Join-Path $desktopDirectory 'Canvas Weekly'
}
if (-not [IO.Path]::IsPathRooted($OutputDirectory)) {
    throw 'OutputDirectory must be an absolute filesystem path.'
}
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $resolvedOutput -PathType Leaf) {
    throw 'OutputDirectory points to an existing file. Choose a folder.'
}

if (-not $ShowOnly) {
    [IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null
}

[pscustomobject]@{
    OutputDirectory = $resolvedOutput
    WeekStartsOn = $config.weekStartsOn
    TimeZone = $config.timeZone
    LookAheadDays = $config.lookAheadDays
    Status = 'Output setup only; Canvas collection is not implemented yet.'
}
