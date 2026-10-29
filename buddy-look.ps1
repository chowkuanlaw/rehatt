# Kopi the buddy (buddy-main.cjs): reading and fixing a Word document. (What is under Kopi: buddy-helper.ps1.)
#   word-read <title>       -> the whole document text, page by page
#   word-fix <title> <json> -> applies fixes as tracked changes, so you accept or reject them in Word
param([string]$mode, [string]$a, [string]$b)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

function Out-Json($value) { $value | ConvertTo-Json -Compress -Depth 4 }

# Word says "busy, call again later" while it is saving or repaginating: wait a moment and retry
function Retry($block) {
  for ($i = 0; $i -lt 40; $i++) {
    try { return & $block }
    catch { $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }
      if ($e.HResult -notin @(-2147418111, -2147417846)) { throw }; Start-Sleep -Milliseconds 250 }
  }
  throw "Word is busy. Try again in a moment."
}

function Get-Doc($title) {
  $word = [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application')
  foreach ($d in $word.Documents) {
    $base = [IO.Path]::GetFileNameWithoutExtension($d.Name)
    if ($title -like "*$($d.Name)*" -or ($base -and $title -like "$base*")) { return $d }
  }
  return $word.ActiveDocument
}

if ($mode -eq 'word-read') {
  Retry {
  $doc = Get-Doc $a
  $pages = [int]$doc.ComputeStatistics(2)   # wdStatisticPages
  $starts = @()
  for ($i = 1; $i -le $pages; $i++) { $starts += $doc.GoTo(1, 1, $i).Start }   # wdGoToPage, absolute
  $end = $doc.Content.End
  $parts = @()
  for ($i = 0; $i -lt $starts.Count; $i++) {
    $to = if ($i + 1 -lt $starts.Count) { $starts[$i + 1] } else { $end }
    if ($to -gt $starts[$i]) { $parts += "[page $($i + 1)]`n" + $doc.Range($starts[$i], $to).Text }
  }
  Out-Json @{ name = $doc.Name; pages = $pages; text = ($parts -join "`n") }
  }
  exit 0
}

if ($mode -eq 'word-fix') {
  $doc = Retry { Get-Doc $a }
  $fixes = Get-Content -Raw -Encoding UTF8 $b | ConvertFrom-Json
  $tracking = Retry { $doc.TrackRevisions }
  Retry { $doc.TrackRevisions = $true }
  $done = 0
  foreach ($f in $fixes) {
    # -ceq: a fix that only changes a capital ("friday" → "Friday") is still a fix (-eq ignores case)
    if (-not $f.find -or $f.find.Length -gt 250 -or $f.find -ceq $f.replace) { continue }
    # find the whole snippet, then change only the words that differ (pre/suf = characters that stay the same)
    $r = Retry { $doc.Content }
    # Execute(FindText, MatchCase, WholeWord, Wildcards, SoundsLike, AllForms, Forward, Wrap=stop)
    if (Retry { $r.Find.Execute($f.find, $true, $false, $false, $false, $false, $true, 0) }) {
      $mid = if ($null -ne $f.mid) { [string]$f.mid } else { [string]$f.replace }   # no pre/suf/mid: replace the whole snippet
      Retry { $r.SetRange($r.Start + [int]$f.pre, $r.End - [int]$f.suf); $r.Text = $mid }
      $done++
    }
  }
  Retry { $doc.TrackRevisions = $tracking }   # the fixes stay as tracked changes; your own typing is not tracked
  Out-Json @{ applied = $done; total = @($fixes).Count }
  exit 0
}

Out-Json @{ error = "unknown mode $mode" }
exit 1
