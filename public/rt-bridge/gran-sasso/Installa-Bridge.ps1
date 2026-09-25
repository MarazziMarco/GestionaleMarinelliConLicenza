param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Viterbo", "Gran Sasso")]
  [string]$Store
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$officialApiBaseUrl = "https://gestionale-stefano-marinelli.vercel.app"

function Stop-WithMessage([string]$Message) {
  Write-Host "`nERRORE: $Message" -ForegroundColor Red
  Read-Host "Premi INVIO per chiudere"
  exit 1
}

function Test-TcpEndpoint {
  param([string]$HostName, [int]$Port, [int]$TimeoutMilliseconds = 5000)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $pending = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $pending.AsyncWaitHandle.WaitOne($TimeoutMilliseconds, $false)) { throw "Timeout." }
    $client.EndConnect($pending)
    return $client.Connected
  } finally {
    $client.Close()
  }
}

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Stop-WithMessage "Avvia il file di installazione come amministratore."
  }

  $sourceRoot = $PSScriptRoot
  $bridgeSource = Join-Path $sourceRoot "MarinelliRTBridge.ps1"
  $templateName = if ($Store -eq "Viterbo") { "config-viterbo.example.json" } else { "config-gran-sasso.example.json" }
  $configSource = Join-Path $sourceRoot $templateName
  if (-not (Test-Path -LiteralPath $bridgeSource) -or -not (Test-Path -LiteralPath $configSource) -or -not (Test-Path -LiteralPath (Join-Path $sourceRoot "Aggiorna-Chiave.ps1")) -or -not (Test-Path -LiteralPath (Join-Path $sourceRoot "Aggiorna-Chiave-Gran-Sasso.cmd"))) {
    Stop-WithMessage "Il pacchetto non e completo. Estrai tutto lo ZIP prima di avviare l'installazione."
  }

  Write-Host "MARINELLI STEFANO - COLLEGAMENTO REGISTRATORE RT" -ForegroundColor Green
  Write-Host "Negozio: $Store`n"
  $secureToken = Read-Host "Incolla la chiave generata in Amministrazione > Registratori RT" -AsSecureString
  $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer) }
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 24) {
    Stop-WithMessage "La chiave inserita non e valida."
  }

  $slug = if ($Store -eq "Viterbo") { "Viterbo" } else { "GranSasso" }
  $installRoot = Join-Path $env:ProgramData "MarinelliRTBridge\$slug"
  $taskName = "Marinelli RT Bridge - $Store"
  $powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $config = Get-Content -LiteralPath $configSource -Raw | ConvertFrom-Json
  $config.ApiBaseUrl = $officialApiBaseUrl
  if ($Store -ne "Gran Sasso" -or $config.Store -ne "Gran Sasso" -or $config.Adapter -ne "epson_fpmate") {
    Stop-WithMessage "Questo pacchetto e riservato al registratore Epson del Gran Sasso."
  }
  $config.DeviceToken = $token.Trim()
  $config | Add-Member -NotePropertyName LogPath -NotePropertyValue (Join-Path $installRoot "bridge.log") -Force
  $config | Add-Member -NotePropertyName FiscalJobsNotBeforeUtc -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force

  Write-Host "Verifica e associazione della chiave $Store..." -ForegroundColor Cyan
  try {
    $headers = @{ Authorization = "Bearer $($config.DeviceToken)" }
    $pairingBody = @{ action = "heartbeat"; store = $Store; status = "installing"; error = "" } | ConvertTo-Json -Compress
    Invoke-RestMethod -Method Post -Uri "$($config.ApiBaseUrl.TrimEnd('/'))/api/fiscal" -Headers $headers -ContentType "application/json; charset=utf-8" -Body $pairingBody -UseBasicParsing -TimeoutSec 30 | Out-Null
  } catch {
    Stop-WithMessage "La chiave $Store e stata rifiutata dal gestionale. Genera una nuova chiave del negozio corretto e ripeti l'installazione. Dettaglio: $($_.Exception.Message)"
  }
  Write-Host "Chiave verificata e ponte $Store abilitato." -ForegroundColor Green

  if ($Store -eq "Viterbo") {
    $rchHost = Read-Host "Indirizzo IP RCH [$($config.RchHost)]"
    if (-not [string]::IsNullOrWhiteSpace($rchHost)) { $config.RchHost = $rchHost.Trim() }
    $rchPort = Read-Host "Porta RCH [$($config.RchPort)]"
    if (-not [string]::IsNullOrWhiteSpace($rchPort)) { $config.RchPort = [int]$rchPort }
    Write-Host "Verifica Wi-Fi/TCP verso $($config.RchHost):$($config.RchPort)..." -ForegroundColor Cyan
    try { $reachable = Test-TcpEndpoint -HostName ([string]$config.RchHost) -Port ([int]$config.RchPort) }
    catch { Stop-WithMessage "La cassa RCH non risponde su $($config.RchHost):$($config.RchPort). $($_.Exception.Message)" }
    if (-not $reachable) { Stop-WithMessage "La cassa RCH non risponde su $($config.RchHost):$($config.RchPort)." }
    Write-Host "RCH raggiungibile. Il test non ha inviato comandi alla cassa." -ForegroundColor Green
  } else {
    $fpMate = Read-Host "Percorso EpsonFpMate.exe [$($config.EpsonFpMatePath)]"
    if (-not [string]::IsNullOrWhiteSpace($fpMate)) { $config.EpsonFpMatePath = $fpMate.Trim() }
    if (-not (Test-Path -LiteralPath $config.EpsonFpMatePath)) {
      Stop-WithMessage "EpsonFpMate.exe non trovato. Fallo installare dal tecnico Epson e ripeti l'installazione."
    }
    $settingsPath = Read-Host "Percorso Settings.xml Epson [$($config.EpsonSettingsPath)]"
    if (-not [string]::IsNullOrWhiteSpace($settingsPath)) { $config.EpsonSettingsPath = $settingsPath.Trim() }
    if (-not (Test-Path -LiteralPath $config.EpsonSettingsPath)) {
      Stop-WithMessage "Settings.xml Epson non trovato. Chiedi al tecnico Epson il percorso corretto."
    }
    $config.WorkDirectory = Join-Path $installRoot "Epson\Input"
    $config.EpsonOutputDirectory = Join-Path $installRoot "Epson\Output"
    New-Item -ItemType Directory -Force -Path $config.WorkDirectory, $config.EpsonOutputDirectory | Out-Null
  }

  if (Get-ScheduledTask -TaskName "Marinelli RT Bridge - Viterbo" -ErrorAction SilentlyContinue) {
    Stop-WithMessage "Su questo PC esiste gia il ponte Viterbo sulla stessa porta 8080. Installa il Gran Sasso sul suo PC dedicato."
  }

  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existingTask) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
  New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
  Copy-Item -LiteralPath $bridgeSource -Destination (Join-Path $installRoot "MarinelliRTBridge.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $sourceRoot "Aggiorna-Chiave.ps1") -Destination (Join-Path $installRoot "Aggiorna-Chiave.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $sourceRoot "Aggiorna-Chiave-Gran-Sasso.cmd") -Destination (Join-Path $installRoot "Aggiorna-Chiave-Gran-Sasso.cmd") -Force
  $configPath = Join-Path $installRoot "config.json"
  $config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $configPath -Encoding UTF8
  $systemName = (New-Object Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([Security.Principal.NTAccount]).Value
  & icacls.exe $configPath /inheritance:r /grant:r "${systemName}:(F)" "*S-1-5-32-544:(F)" | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Impossibile proteggere la chiave del ponte." }

  $localPort = if ($config.LocalWebSocketPort) { [int]$config.LocalWebSocketPort } else { 8080 }
  $localPrefix = "http://localhost:$localPort/"
  & netsh.exe http show urlacl "url=$localPrefix" *> $null
  if ($LASTEXITCODE -eq 0) { & netsh.exe http delete urlacl "url=$localPrefix" *> $null }
  & netsh.exe http add urlacl "url=$localPrefix" "user=$systemName" | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Impossibile riservare il collegamento locale $localPrefix per SISTEMA." }

  $bridgePath = Join-Path $installRoot "MarinelliRTBridge.ps1"
  $arguments = "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$bridgePath`" -ConfigPath `"$configPath`""
  $action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments -WorkingDirectory $installRoot
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $trigger.Delay = "PT1M"
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 60 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId "S-1-5-18" -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -Description "Collegamento automatico tra il gestionale Marinelli Stefano e il registratore RT $Store." -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 4
  $task = Get-ScheduledTask -TaskName $taskName
  $info = Get-ScheduledTaskInfo -TaskName $taskName
  if ($task.State -ne "Running") {
    Stop-WithMessage "L'avvio automatico non e riuscito. Codice Windows: $($info.LastTaskResult)."
  }

  Write-Host "`nINSTALLAZIONE COMPLETATA" -ForegroundColor Green
  Write-Host "Il ponte parte da solo all'accensione del computer, come SISTEMA."
  Write-Host "Non serve che nessuno acceda a Windows."
  Write-Host "Gestionale: $officialApiBaseUrl"
  Write-Host "Installato in: $installRoot"
  Write-Host "Canale locale: ws://localhost:$localPort"
  Write-Host "Stato attuale: in esecuzione"
  Write-Host "Registro tecnico: $(Join-Path $installRoot 'bridge.log')"
  if ($Store -eq "Viterbo") {
    Write-Host "`nIl collegamento e gia abilitato. Torna nel gestionale e attendi lo stato COLLEGATO."
    Write-Host "Il ponte inviera direttamente gli scontrini tramite Protocollo Standard RCH e chiudera automaticamente l'Opzione Fidelity." -ForegroundColor Green
    Write-Host "Prima dell'uso ordinario effettuare uno scontrino di prova in modalita formazione e verificare reparto 1, pagamenti 1/4 e stati aggiuntivi attivi con il tecnico fiscale. Il ponte gestisce ACK attivo o disattivato." -ForegroundColor Yellow
  } else {
    Write-Host "`nIl collegamento e gia abilitato. Torna nel gestionale, attendi lo stato COLLEGATO e fai una stampa di prova con il tecnico fiscale."
    Write-Host "Se rigeneri la chiave dal browser di questo PC, il ponte la riceve automaticamente." -ForegroundColor Green
    Write-Host "Se la rigeneri da un altro PC, usa $installRoot\Aggiorna-Chiave-Gran-Sasso.cmd su questo PC." -ForegroundColor Yellow
    Write-Host "Controlla con il tecnico Epson che Output File XML punti a $($config.EpsonOutputDirectory), senza timestamp e con prefisso Out." -ForegroundColor Yellow
  }
  Read-Host "Premi INVIO per chiudere"
} catch {
  Stop-WithMessage $_.Exception.Message
}
