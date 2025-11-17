@echo off
REM ==========================================
REM  Webツール用のディレクトリ・ファイル自動生成バッチ
REM  使い方:
REM    1) このファイルを create_project.bat などの名前で保存
REM    2) エクスプローラで作りたいフォルダを開き、
REM       アドレスバーに「cmd」と打ってEnter
REM    3) 出てきた黒い画面で:
REM         create_project.bat
REM       または
REM         create_project.bat "C:\path\to\dir"
REM ==========================================

setlocal

REM 引数があればそのパス、なければカレントディレクトリ
set "BASE_DIR=%~1"
if "%BASE_DIR%"=="" set "BASE_DIR=%CD%"

echo [INFO] Base directory: "%BASE_DIR%"

REM ===== ディレクトリ作成 =====
mkdir "%BASE_DIR%\css"           2>nul
mkdir "%BASE_DIR%\js"            2>nul
mkdir "%BASE_DIR%\js\core"       2>nul
mkdir "%BASE_DIR%\js\parser"     2>nul
mkdir "%BASE_DIR%\js\services"   2>nul
mkdir "%BASE_DIR%\js\ui"         2>nul

REM ===== ファイル作成（存在していなければ空ファイルを作る） =====
call :ensure_file "%BASE_DIR%\index.html"

call :ensure_file "%BASE_DIR%\css\base.css"
call :ensure_file "%BASE_DIR%\css\layout.css"
call :ensure_file "%BASE_DIR%\css\panel.css"
call :ensure_file "%BASE_DIR%\css\block-card.css"
call :ensure_file "%BASE_DIR%\css\controls.css"
call :ensure_file "%BASE_DIR%\css\state.css"

call :ensure_file "%BASE_DIR%\js\core\expr-node.js"
call :ensure_file "%BASE_DIR%\js\core\block.js"
call :ensure_file "%BASE_DIR%\js\core\block-repository.js"
call :ensure_file "%BASE_DIR%\js\core\render-context.js"

call :ensure_file "%BASE_DIR%\js\parser\token.js"
call :ensure_file "%BASE_DIR%\js\parser\lexer.js"
call :ensure_file "%BASE_DIR%\js\parser\parser.js"

call :ensure_file "%BASE_DIR%\js\services\expression-service.js"

call :ensure_file "%BASE_DIR%\js\ui\dom-utils.js"
call :ensure_file "%BASE_DIR%\js\ui\view-renderer.js"
call :ensure_file "%BASE_DIR%\js\ui\app-controller.js"

call :ensure_file "%BASE_DIR%\js\main.js"

echo.
echo [DONE] プロジェクト構成を作成しました。
goto :EOF

REM ===== サブルーチン: ファイルが無ければ作成 =====
:ensure_file
set "TARGET_FILE=%~1"
if not exist "%TARGET_FILE%" (
    echo [CREATE] "%TARGET_FILE%"
    type nul > "%TARGET_FILE%"
) else (
    echo [SKIP]   "%TARGET_FILE%" (既に存在)
)
goto :EOF
