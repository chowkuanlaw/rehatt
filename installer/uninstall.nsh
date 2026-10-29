; Rehatt uninstaller: ask before deleting your data (like Lapis Stretch and Teh Tarik Meter did).
; Never asks during an update (the old version is removed silently then), and a silent uninstall keeps the data.
; Rehatt keeps everything in %APPDATA%\Rehatt: your stretch and water history, collected kuih, usage history and settings.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also remove your Rehatt data from this PC?$\r$\n(your stretch and water history, collected kuih, usage history and settings)$\r$\n$\r$\nPadam juga data Rehatt anda dari PC ini?$\r$\n(sejarah regangan dan air, kuih yang dikumpul, sejarah penggunaan dan tetapan)$\r$\n$\r$\nChoose No to keep it in case you install Rehatt again." /SD IDNO IDNO rehatt_keep_data
      SetShellVarContext current
      ${if} "$APPDATA" != ""
        RMDir /r "$APPDATA\Rehatt"
      ${endIf}
    rehatt_keep_data:
  ${endIf}
!macroend
