@echo off
setlocal

set "MVN_VERSION=3.9.9"
set "BASE_DIR=%~dp0"
set "MVN_DIR=%BASE_DIR%.mvn\apache-maven-%MVN_VERSION%"
set "MVN_BIN=%MVN_DIR%\bin\mvn.cmd"
set "ARCHIVE=%BASE_DIR%.mvn\apache-maven-%MVN_VERSION%-bin.zip"
set "URL=https://archive.apache.org/dist/maven/maven-3/%MVN_VERSION%/binaries/apache-maven-%MVN_VERSION%-bin.zip"

if not exist "%MVN_BIN%" (
  if not exist "%BASE_DIR%.mvn" mkdir "%BASE_DIR%.mvn"
  echo Downloading Maven %MVN_VERSION%...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '%URL%' -OutFile '%ARCHIVE%'"
  if errorlevel 1 exit /b 1
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force -Path '%ARCHIVE%' -DestinationPath '%BASE_DIR%.mvn'"
  if errorlevel 1 exit /b 1
)

call "%MVN_BIN%" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
