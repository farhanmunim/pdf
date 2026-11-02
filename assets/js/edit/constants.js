/* Editor constants. */

/* Screen font stacks and pdf-lib standard fonts for each family/style. */
export const STD_FONTS = {
  Helvetica: {
    css: "Helvetica, Arial, sans-serif",
    std: { regular: "Helvetica", bold: "HelveticaBold", italic: "HelveticaOblique", boldItalic: "HelveticaBoldOblique" },
  },
  Times: {
    css: "'Times New Roman', Times, serif",
    std: { regular: "TimesRoman", bold: "TimesRomanBold", italic: "TimesRomanItalic", boldItalic: "TimesRomanBoldItalic" },
  },
  Courier: {
    css: "'Courier New', Courier, monospace",
    std: { regular: "Courier", bold: "CourierBold", italic: "CourierOblique", boldItalic: "CourierBoldOblique" },
  },
};

export const LINE_HEIGHT = 1.2; // must match .tbox line-height in CSS
