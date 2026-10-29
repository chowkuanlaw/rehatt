$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
$references = @(
  [System.Windows.Automation.AutomationElement].Assembly.Location,
  [System.Windows.Automation.ControlType].Assembly.Location,
  [System.Windows.Rect].Assembly.Location
) | Select-Object -Unique
Add-Type -Path (Join-Path $PSScriptRoot 'windows-ai-access.cs') -ReferencedAssemblies $references
function Target-From($value) {
  $target = New-Object KopiIsland.Native.Target
  $target.id = [string]$value.id
  $target.handle = [long]$value.handle
  $target.pid = [int]$value.pid
  $target.title = [string]$value.title
  $target.process = [string]$value.process
  $target.started = [string]$value.started
  return $target
}
while ($null -ne ($line = [Console]::ReadLine())) {
  $request = $null
  try {
    $request = ConvertFrom-Json -InputObject $line
    switch ($request.method) {
      'windows' { $result = @{ ok = $true; windows = @([KopiIsland.Native.Access]::Windows()) } }
      'read' { $result = [KopiIsland.Native.Access]::Read((Target-From $request.target)) }
      'open' { [KopiIsland.Native.Access]::Open((Target-From $request.target)); $result = @{ ok = $true } }
      'reply' {
        $guards = @($request.guards | ForEach-Object {
          $guard = New-Object KopiIsland.Native.Guard
          $guard.id = [string]$_.id; $guard.name = [string]$_.name; $guard
        })
        $timeline = @($request.timeline | ForEach-Object {
          $guard = New-Object KopiIsland.Native.Guard
          $guard.id = [string]$_.id; $guard.name = [string]$_.name; $guard
        })
        [KopiIsland.Native.Access]::Reply((Target-From $request.target), [string]$request.contextKey,
          [string]$request.composerId, [KopiIsland.Native.Guard[]]$guards, [KopiIsland.Native.Guard[]]$timeline, [string]$request.text)
        $result = @{ ok = $true }
      }
      default { throw 'Unknown command.' }
    }
    $response = @{ id = $request.id; result = $result }
  } catch {
    $response = @{ id = $request.id; result = @{ ok = $false; error = $_.Exception.Message } }
  }
  [Console]::WriteLine((ConvertTo-Json -InputObject $response -Depth 10 -Compress))
}
