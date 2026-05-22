Add-Type -AssemblyName System.Drawing

$sheetPath = Join-Path $PSScriptRoot "..\..\img-sheet.png"
$outDir = Join-Path $PSScriptRoot "..\public\brand"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$sheet = [System.Drawing.Bitmap]::FromFile((Resolve-Path $sheetPath))

function Crop-Bitmap($bitmap, [int]$x, [int]$y, [int]$w, [int]$h) {
  $rect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
  return $bitmap.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
}

function Save-Png($bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Resize-Bitmap($bitmap, [int]$w, [int]$h) {
  $out = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($bitmap, 0, 0, $w, $h)
  $g.Dispose()
  return $out
}

function Make-White-Transparent($bitmap) {
  $out = New-Object System.Drawing.Bitmap($bitmap.Width, $bitmap.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      $c = $bitmap.GetPixel($x, $y)
      if ($c.R -gt 246 -and $c.G -gt 246 -and $c.B -gt 246) {
        $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $c.R, $c.G, $c.B))
      } else {
        $out.SetPixel($x, $y, $c)
      }
    }
  }
  return $out
}

# Master brand crops from the finalized sheet.
# Coordinates are tied to the committed 1536x1024 `img-sheet.png`.
$horizontalRaw = Crop-Bitmap $sheet 68 92 560 210
$horizontal = Make-White-Transparent $horizontalRaw
Save-Png $horizontal (Join-Path $outDir "spendova-horizontal.png")

$symbolRaw = Crop-Bitmap $sheet 72 98 118 188
$symbol = Make-White-Transparent $symbolRaw
Save-Png $symbol (Join-Path $outDir "spendova-symbol.png")

$iconMaster = Crop-Bitmap $sheet 727 94 148 148
foreach ($size in @(1024, 512, 192, 180, 128, 32, 16)) {
  $icon = Resize-Bitmap $iconMaster $size $size
  Save-Png $icon (Join-Path $outDir "spendova-icon-$size.png")
  $icon.Dispose()
}

Copy-Item (Join-Path $outDir "spendova-icon-32.png") (Join-Path $PSScriptRoot "..\public\favicon.png") -Force

$sheet.Dispose()
$horizontalRaw.Dispose()
$horizontal.Dispose()
$symbolRaw.Dispose()
$symbol.Dispose()
$iconMaster.Dispose()
