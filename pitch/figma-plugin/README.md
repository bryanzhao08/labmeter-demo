# LaBro v6 · Figma Slides plugin

This local development plugin adds **one new row named LaBro v6**, containing nine main slides and five appendix slides, to the currently open Figma Slides deck. It does not edit or delete existing slides. Each invocation adds another row. The visuals, diagrams, chart-like shapes and slide text are native editable Figma nodes. The microscope photograph is from USC Optical Imaging Facility. Product screenshots are captures of the current app using synthetic data.

## Prepare and import

1. Install or enable **Big Shoulders Display**, **Schibsted Grotesk**, and **DM Mono** in Figma. The plugin falls back to available Arial/Inter variants if a requested family is unavailable; inspect typography after generation.
2. From the repository root, run `node pitch/figma-plugin/build.cjs` to refresh the embedded notes from the latest `pitch/script-v6.md`. Run `node pitch/figma-plugin/verify.cjs` for the local structural check.
3. In the Figma desktop app, open the destination **Figma Slides** deck. Use Plugins → Development → Import plugin from manifest and select this folder's `manifest.json`. Run **LaBro v6 Slides** from the development plugins menu. Depending on the Figma version, the import command may be under the main menu's Plugins submenu.
4. Inspect the appended row, especially text wrapping, typography, layout and slide order. The official API creates fixed 1920 × 1080 slides. Existing content should still be present.
5. Presenter notes: the documented plugin API does not expose a writable presenter-notes field. Each slide contains a hidden editable text layer named **Presenter notes · copy to Slides notes**. Select the layer in the layer tree and copy its text into that slide's presenter notes; the main-slide text is also available in `pitch/script-v6.md`. Appendix notes are in the hidden layers. Hidden layers are not native presenter notes until copied.

The microscope photograph is credited to [USC Optical Imaging Facility](https://microscopy.usc.edu/equipment-2/) ([source image](https://sites.usc.edu/microscopy/files/2014/08/Axioimager-1-crop.jpg)); rights remain with the source and permission for reuse has not been verified. It does not depict John. Screenshots are current LaBro app captures using synthetic data; see [asset provenance](../assets/README.md). The screenshots illustrate the workflow rather than John’s simulated incident. Keep the simulated-data labels visible.

## API references

- [Working in Slides](https://developers.figma.com/docs/plugins/working-in-slides/)
- [createSlideRow](https://developers.figma.com/docs/plugins/api/properties/figma-createsliderow/) and [createSlide](https://developers.figma.com/docs/plugins/api/properties/figma-createslide/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
