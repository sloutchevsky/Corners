param(
  [string]$FontFile = 'C:\Users\Vas\AppData\Local\Microsoft\Windows\Fonts\HelveticaNeueLTCom-Ex.ttf'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$fontCollection = [System.Drawing.Text.PrivateFontCollection]::new()
$fontCollection.AddFontFile($FontFile)
$fontFamily = $fontCollection.Families[0]
$format = [System.Drawing.StringFormat]::GenericTypographic.Clone()
$format.FormatFlags = $format.FormatFlags -bor [System.Drawing.StringFormatFlags]::MeasureTrailingSpaces
$font = [System.Drawing.Font]::new($fontFamily, 100, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$bitmap = [System.Drawing.Bitmap]::new(1, 1)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$outputDirectory = Join-Path (Split-Path $PSScriptRoot) 'src\ui\brand'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
function Write-Brand([string]$Text, [string]$Filename, [double]$Tracking) {
  $outline = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $position = 0.0
  foreach ($letter in $Text.ToCharArray()) {
    $outline.AddString([string]$letter, $fontFamily, 0, 100, [System.Drawing.PointF]::new($position, 0), $format)
    $position += $graphics.MeasureString([string]$letter, $font, [System.Drawing.PointF]::new(0, 0), $format).Width + $Tracking
  }
  $bounds = $outline.GetBounds()
  $points = $outline.PathPoints
  $types = $outline.PathTypes
  $segments = [System.Collections.Generic.List[string]]::new()
  $culture = [System.Globalization.CultureInfo]::InvariantCulture
  function Number([double]$value) { return $value.ToString('0.###', $culture) }
  for ($i = 0; $i -lt $points.Length; $i++) {
    $type = $types[$i] -band 7
    if ($type -eq 0) { $segments.Add('M' + (Number $points[$i].X) + ' ' + (Number $points[$i].Y)) }
    elseif ($type -eq 1) { $segments.Add('L' + (Number $points[$i].X) + ' ' + (Number $points[$i].Y)) }
    elseif ($type -eq 3) {
      $segments.Add('C' + (Number $points[$i].X) + ' ' + (Number $points[$i].Y) + ' ' + (Number $points[$i+1].X) + ' ' + (Number $points[$i+1].Y) + ' ' + (Number $points[$i+2].X) + ' ' + (Number $points[$i+2].Y))
      $i += 2
    }
    if (($types[$i] -band 128) -ne 0) { $segments.Add('Z') }
  }
  $viewBox = (Number $bounds.X) + ' ' + (Number $bounds.Y) + ' ' + (Number $bounds.Width) + ' ' + (Number $bounds.Height)
  $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + $viewBox + '"><path fill="black" d="' + ($segments -join '') + '"/></svg>'
  Set-Content -LiteralPath (Join-Path $outputDirectory $Filename) -Value $svg -Encoding utf8
  Write-Output ($Filename + ': ' + $fontFamily.Name + ', ' + $viewBox)
  $outline.Dispose()
}
# Keep the supplied font as installed; ship only the two logo outlines.
Write-Brand 'flashborn' 'wordmark.svg' 13
Write-Brand 'f' 'f.svg' 0
$graphics.Dispose(); $bitmap.Dispose(); $font.Dispose(); $format.Dispose(); $fontCollection.Dispose()
