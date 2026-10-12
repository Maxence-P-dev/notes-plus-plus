; Branded texts for the Notes++ installer (electron-builder NSIS hooks).

!macro customHeader
  !define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH
  !define MUI_FINISHPAGE_TITLE "Notes++ est prêt !"
  !define MUI_FINISHPAGE_TEXT "Notes++ a bien été installé sur ton ordinateur.$\r$\n$\r$\nTes cours seront enregistrés dans Documents\Mes Cours. Un raccourci a été ajouté sur le bureau et dans le menu Démarrer.$\r$\n$\r$\nBon courage pour tes révisions !"
  !define MUI_FINISHPAGE_RUN_TEXT "Lancer Notes++ maintenant"
  !define MUI_FINISHPAGE_LINK "Voir le projet sur GitHub"
  !define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/Maxence-P-dev/notes-plus-plus"
  !define MUI_UNWELCOMEPAGE_TITLE "Désinstaller Notes++"
  !define MUI_UNWELCOMEPAGE_TEXT "Notes++ va être retiré de ton ordinateur.$\r$\n$\r$\nTes cours ne seront pas supprimés : ils restent dans Documents\Mes Cours."
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenue dans Notes++"
  !define MUI_WELCOMEPAGE_TEXT "Ton cahier de cours, en mieux.$\r$\n$\r$\n•  Dossiers et sous-dossiers pour chaque matière$\r$\n•  Titres, couleurs, tableaux, images et encadrés$\r$\n•  Thème clair ou sombre$\r$\n•  Recherche et export PDF$\r$\n•  Enregistrement automatique$\r$\n$\r$\nClique sur Suivant pour commencer l'installation."
  !insertmacro MUI_PAGE_WELCOME
!macroend
