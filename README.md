# Iris — ton cahier de cours

Iris est une application Windows pour prendre ses cours : comme le Bloc-notes, mais avec de la vraie mise en forme, des dossiers et un beau design.

## Fonctionnalités

- **Dossiers et sous-dossiers** illimités pour ranger ses cours, avec glisser-déposer, renommage et clic droit.
- **Mise en forme riche** : titres, gras, italique, souligné, couleurs, surlignage, listes, cases à cocher, citations, code, tableaux, images, liens, alignement.
- **Encadrés de cours** : *Info*, *Définition*, *Attention*, *À retenir*.
- **Menu `/`** : tape `/` pour insérer n'importe quel bloc sans quitter le clavier.
- **Thème clair, sombre ou système**.
- **Enregistrement automatique** pendant que tu écris.
- **Recherche** dans les titres et dans le contenu de tous les cours (`Ctrl+P`).
- **Export PDF** propre, au format A4 et paginé (`Ctrl+Maj+E`).
- **Mode concentration** en plein écran (`F11`), zoom (`Ctrl +` / `Ctrl −`), correcteur orthographique en français.

Les cours sont de simples fichiers `.cours` (en HTML) dans `Documents\Mes Cours`. Tu peux changer ce dossier depuis le bas de la barre latérale, par exemple pour le mettre dans OneDrive.

## Installation

Télécharge la dernière version dans les [**Releases**](../../releases) :

- `Iris-Setup-x.y.z.exe` : l'installeur, qui crée un raccourci sur le bureau et dans le menu Démarrer.
- `Iris-x.y.z-win-x64.zip` : la version portable. Il suffit de la décompresser et de lancer `Iris.exe`.

> L'application n'est pas signée numériquement. Au premier lancement, Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » : clique sur **Informations complémentaires**, puis sur **Exécuter quand même**.

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

## Licence

MIT
