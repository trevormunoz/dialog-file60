/**
 * Source tag → DIALOG display code. Every entry names its registry key. `dialog` is `null`
 * for a tag with no DIALOG display code of its own: SX and TX are display text carried from
 * the SD/TD search fields, not independently coded.
 */
export const MAP: Record<string, { dialog: string | null; registry: string }> = {
  AN: { dialog: "AN=", registry: "map.AN.display_padding" }, PN: { dialog: "PN=", registry: "map.PN" }, AS: { dialog: "AS=", registry: "map.AS" },
  DS: { dialog: "DS=", registry: "map.DS" }, PT: { dialog: "PT=", registry: "map.PT" }, RG: { dialog: "RG=", registry: "map.RG" }, RN: { dialog: "RN=", registry: "map.RN" },
  SX: { dialog: null, registry: "map.SX_TX.display_text" }, TX: { dialog: null, registry: "map.SX_TX.display_text" }, FY: { dialog: "FY=", registry: "map.FY" },
  IN: { dialog: "IN=", registry: "map.IN" }, PF: { dialog: "PO=", registry: "map.PO.displays_PF_PI" }, PI: { dialog: "PO=", registry: "map.PO.displays_PF_PI" },
  CY: { dialog: "CY=", registry: "map.CY" }, ST: { dialog: "ST=", registry: "map.ST" }, ZP: { dialog: "ZP=", registry: "map.ZP" }, TI: { dialog: "/TI", registry: "map.TI" },
  RP: { dialog: "PC=", registry: "map.PC.composite" }, AC: { dialog: "PC=", registry: "map.PC.composite" }, CM: { dialog: "PC=", registry: "map.PC.composite" },
  FS: { dialog: "PC=", registry: "map.PC.composite" }, CT: { dialog: "PC=", registry: "map.PC.composite" }, PA: { dialog: "GC=", registry: "map.GC.composite" }, JC: { dialog: "GC=", registry: "map.GC.composite" },
  PH: { dialog: "SH=", registry: "render.headings.join" }, GH: { dialog: "SH=", registry: "render.headings.join" }, SC: { dialog: "SC=", registry: "map.SC.percent_from_SN" }, SN: { dialog: "SC=", registry: "map.SC.percent_from_SN" },
  BT: { dialog: "B1=", registry: "map.BT" }, AT: { dialog: "A1=", registry: "map.AT" }, DT: { dialog: "D1=", registry: "map.DT" },
  OB: { dialog: "/OB", registry: "map.OB" }, AP: { dialog: "/AP", registry: "map.AP" }, DE: { dialog: "/DE", registry: "map.DE" },
  PX: { dialog: "PP=", registry: "map.PP.display_from_PX" }, PR: { dialog: "/PR", registry: "map.PR" }, PB: { dialog: "/PB", registry: "map.PB" },
  OC: { dialog: "OC=", registry: "map.OC" }, IC: { dialog: "IC=", registry: "map.IC" }, RE: { dialog: "RE=", registry: "map.RE" }, PD: { dialog: "PD=", registry: "map.PD" },
  UP: { dialog: "UP=", registry: "map.UP" }, PS: { dialog: "PS=", registry: "map.PS" }, SF: { dialog: "SF=", registry: "map.SF" },
};
