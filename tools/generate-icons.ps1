Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

function Save-BottleIcon {
  param(
    [int]$Size,
    [string]$Path,
    [switch]$Maskable
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#8166d8'))

  $scale = $Size / 512
  $offset = 0
  if ($Maskable) {
    $scale *= 0.84
    $offset = ($Size - (512 * $scale)) / 2
  }
  $graphics.TranslateTransform($offset, $offset)
  $graphics.ScaleTransform($scale, $scale)

  $bottleFill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#fffdfb'))
  $collarFill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#ebe7ff'))
  $milkFill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#f19bc5'))
  $markFill = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#6d54bd'))
  $outline = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#6d54bd'), 7)

  # Nipple and collar.
  $graphics.FillEllipse($bottleFill, 209, 68, 94, 114)
  $graphics.FillRectangle($bottleFill, 209, 124, 94, 58)
  $graphics.FillRectangle($collarFill, 180, 164, 152, 50)
  $graphics.DrawRectangle($outline, 180, 164, 152, 50)

  # Bottle body with broad shoulders and a rounded base.
  $graphics.FillRectangle($bottleFill, 156, 198, 200, 50)
  $graphics.FillRectangle($bottleFill, 140, 226, 232, 166)
  $graphics.FillEllipse($bottleFill, 140, 352, 232, 98)
  $graphics.FillRectangle($bottleFill, 140, 352, 232, 49)
  $graphics.DrawLine($outline, 156, 198, 356, 198)
  $graphics.DrawLine($outline, 156, 198, 156, 226)
  $graphics.DrawLine($outline, 356, 198, 356, 226)
  $graphics.DrawLine($outline, 140, 226, 140, 398)
  $graphics.DrawLine($outline, 372, 226, 372, 398)

  # Milk stays inside the bottle, with a rounded bottom matching the body.
  $graphics.FillRectangle($milkFill, 155, 310, 202, 82)
  $graphics.FillEllipse($milkFill, 155, 352, 202, 80)
  $graphics.FillRectangle($milkFill, 155, 352, 202, 40)
  $graphics.FillRectangle($markFill, 286, 252, 48, 10)
  $graphics.FillRectangle($markFill, 304, 278, 30, 10)
  $graphics.FillRectangle($markFill, 286, 304, 48, 10)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $outline.Dispose()
  $markFill.Dispose()
  $milkFill.Dispose()
  $collarFill.Dispose()
  $bottleFill.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$iconsPath = Join-Path $PSScriptRoot '..\icons'
Save-BottleIcon -Size 192 -Path (Join-Path $iconsPath 'icon-192.png')
Save-BottleIcon -Size 512 -Path (Join-Path $iconsPath 'icon-512.png')
Save-BottleIcon -Size 512 -Path (Join-Path $iconsPath 'icon-maskable-512.png') -Maskable