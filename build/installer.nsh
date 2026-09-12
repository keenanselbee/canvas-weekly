; The assisted installer can inherit "all" from an existing HKLM installation.
; With elevation disabled, that radio becomes disabled but can stay checked.
; Default to the available per-user mode before the radio controls are created.
!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    !ifndef MULTIUSER_INSTALLMODE_ALLOW_ELEVATION
      ${IfNot} ${UAC_IsAdmin}
        !insertmacro setInstallModePerUser
      ${EndIf}
    !endif
  !endif
!macroend
