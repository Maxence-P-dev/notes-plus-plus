<p align="center">
  <img src="build/icon.png" alt="" width="96">
</p>

<h1 align="center">Notes++</h1>

<p align="center"><b>Ton cahier de cours, en mieux.</b><br>Comme le Bloc-notes, mais avec de la vraie mise en forme, des dossiers et un beau design.</p>

<p align="center">
  <a href="https://github.com/Maxence-P-dev/notes-plus-plus/releases/latest/download/NotesPlusPlus-Setup.exe"><img src="https://img.shields.io/badge/T%C3%A9l%C3%A9charger-Installeur%20Windows-6d5dfc?style=for-the-badge&logo=windows11&logoColor=white" alt="Télécharger l'installeur Windows"></a>
  <a href="https://github.com/Maxence-P-dev/notes-plus-plus/releases/latest/download/NotesPlusPlus-Portable.zip"><img src="https://img.shields.io/badge/Version-portable%20(.zip)-2c1b94?style=for-the-badge&logo=files&logoColor=white" alt="Télécharger la version portable"></a>
</p>

<p align="center">
  <a href="https://github.com/Maxence-P-dev/notes-plus-plus/releases/latest"><img src="https://img.shields.io/github/v/release/Maxence-P-dev/notes-plus-plus?label=version&color=8b7dff" alt="Dernière version"></a>
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4" alt="Windows 10 et 11">
  <img src="https://img.shields.io/badge/prix-gratuit-30a46c" alt="Gratuit">
  <img src="https://img.shields.io/github/license/Maxence-P-dev/notes-plus-plus?color=555" alt="Licence MIT">
</p>

<p align="center">
  <img src="docs/demo.gif" alt="Démonstration de Notes++ : menu /, mise en forme, encadrés et thème sombre" width="900">
</p>

<p align="center">🎬 <a href="https://github.com/Maxence-P-dev/notes-plus-plus/releases/download/v1.0.0/NotesPlusPlus-Presentation.mp4"><b>Regarder la présentation complète en vidéo</b></a> (3 min, avec voix off)</p>

## Fonctionnalités

- **Dossiers et sous-dossiers** illimités pour ranger ses cours, avec glisser-déposer, renommage et clic droit.
- **Mise en forme riche** : titres, gras, italique, souligné, couleurs, surlignage, listes, cases à cocher, citations, code, tableaux, images, liens, alignement.
- **Images** à placer où tu veux : à gauche, au centre, à droite, ou avec du texte à côté. Redimensionnables et déplaçables.
- **Encadrés de cours** : *Info*, *Définition*, *Attention*, *À retenir*.
- **Menu `/`** : tape `/` pour insérer n'importe quel bloc sans quitter le clavier.
- **Thème clair, sombre ou système**.
- **Enregistrement automatique** pendant que tu écris.
- **Recherche** dans les titres et dans le contenu de tous les cours (`Ctrl+P`).
- **Export PDF** propre, au format A4 et paginé (`Ctrl+Maj+E`).
- **Mode concentration** en plein écran (`F11`), zoom (`Ctrl +` / `Ctrl −`), correcteur orthographique en français.

Les cours sont de simples fichiers `.cours` (en HTML) dans `Documents\Mes Cours`. Tu peux changer ce dossier depuis le bas de la barre latérale, par exemple pour le mettre dans OneDrive.
## Installation

<table>
<tr>
<td width="55%">

1. Clique sur **[Télécharger l'installeur](https://github.com/Maxence-P-dev/notes-plus-plus/releases/latest/download/NotesPlusPlus-Setup.exe)**.
2. Ouvre `NotesPlusPlus-Setup.exe`.
3. Clique sur **Suivant** jusqu'à la fin : Notes++ se lance tout seul.

Un raccourci est ajouté sur le bureau et dans le menu Démarrer.

**Sans installation ?** Prends la [version portable](https://github.com/Maxence-P-dev/notes-plus-plus/releases/latest/download/NotesPlusPlus-Portable.zip), décompresse-la et lance `Notes++.exe`.

</td>
<td width="45%"><img src="docs/installer.png" alt="L'installeur de Notes++"></td>
</tr>
</table>

> [!NOTE]
> L'application n'est pas signée numériquement. Si Windows affiche « Windows a protégé votre ordinateur », clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

## Raccourcis

| Action | Raccourci |
| --- | --- |
| Nouveau cours | `Ctrl+N` |
| Nouveau dossier | `Ctrl+Maj+N` |
| Rechercher | `Ctrl+P` |
| Insérer un bloc | `/` |
| Lien | `Ctrl+K` |
| Thème clair / sombre | `Ctrl+Maj+L` |
| Afficher / masquer la barre latérale | `Ctrl+\` |
| Exporter en PDF | `Ctrl+Maj+E` |
| Mode concentration | `F11` |
| Zoom | `Ctrl +` / `Ctrl −` / `Ctrl 0` |
| Renommer / supprimer (dans l'arborescence) | `F2` / `Suppr` |

## Développement

Il faut [Node.js](https://nodejs.org) 20 ou plus récent.

```bash
npm install
npm start        # lance l'application
npm run dist     # crée l'installeur et le zip dans release/
```

L'application est construite avec Electron et l'éditeur TipTap. Le code est organisé ainsi :

- `app/main.js` : fenêtre, fichiers et dossiers, export PDF
- `app/preload.js` : pont sécurisé entre la fenêtre et le système
- `src/renderer/` : interface (arborescence, barre d'outils, éditeur, menu `/`)
- `app/styles.css` et `app/content.css` : thème de l'interface et style des cours
- `scripts/demo/` : génération automatique de la vidéo de présentation (narration, enregistrement, montage)

## Licence

MIT
