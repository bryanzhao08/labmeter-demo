# Verification and limits

- Intended canvas: 1920 × 1080. Figma Slides fixes this size; plugin does not resize slides.
- `verify.cjs` executes the plugin against a local mock of the used API. It checks one appended row, 14 slides, one hidden notes layer per slide, minimum 30-point text, and basic node bounding boxes. It also checks the generated JavaScript can run through its async entry point. Run it after rebuilding.
- The mock uses approximate text heights; it cannot establish visual fit, verify actual Figma font availability, or test the Figma API. Font metrics, wrapping, rotated elements, z-order, and every slide require an in-Figma visual review.
- Figma's documented SlideNode API has no writable speaker-note field. Notes are hidden text layers and need manual transfer. They are not automatically presenter notes.
- On failure after creation begins, a partial new row may remain; existing rows are not removed. Review the result before running again.
- No verified microscope photo or product screenshot is bundled. Both visual stand-ins are visibly labeled schematics. The timeline and product data are simulated.
- The plugin has no network access. It requests the named fonts from Figma and falls back to locally available fonts if needed.
