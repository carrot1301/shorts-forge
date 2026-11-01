import React from "react";
import { AbsoluteFill, Composition, registerRoot, staticFile } from "remotion";
const C = {
  navy: "#091322",
  panel: "#101e34",
  ink: "#edf3ff",
  muted: "#a9bdd6",
  teal: "#4de0bd",
  gold: "#f5c666",
};
const Plate = ({ episode, part, index = 0 }) => (
  <AbsoluteFill
    style={{
      background: C.navy,
      color: C.ink,
      fontFamily: "Be",
      fontWeight: 400,
    }}
  >
    <style>{`@font-face{font-family:Be;src:url('${staticFile("BeVietnamPro-Regular.ttf")}');font-weight:400}@font-face{font-family:Be;src:url('${staticFile("BeVietnamPro-Bold.ttf")}');font-weight:700}`}</style>
    <div
      style={{
        position: "absolute",
        left: 72,
        top: 90,
        fontSize: 27,
        fontWeight: 700,
        letterSpacing: 4,
        color: C.teal,
      }}
    >
      {episode.brand || "YOUR CHANNEL"}
    </div>
    <div
      style={{
        position: "absolute",
        right: 72,
        top: 85,
        border: "1px solid #3b506b",
        borderRadius: 12,
        padding: "10px 18px",
        fontSize: 23,
        color: C.muted,
      }}
    >
      {episode.series || "SHORTS FORGE"} · {episode.number}
    </div>
    <div
      style={{
        position: "absolute",
        left: 72,
        top: 184,
        fontSize: 24,
        fontWeight: 700,
        color: C.gold,
        letterSpacing: 1.2,
      }}
    >
      {part.eyebrow}
    </div>
    <div
      data-fit="heading"
      style={{
        position: "absolute",
        left: 72,
        top: 246,
        width: 920,
        fontSize: part.heading.length > 38 ? 52 : 61,
        lineHeight: 1.24,
        fontWeight: 700,
      }}
    >
      {part.heading}
    </div>
    <div
      data-fit="sub"
      style={{
        position: "absolute",
        left: 76,
        top: 420,
        width: 910,
        fontSize: 29,
        lineHeight: 1.5,
        color: C.muted,
      }}
    >
      {part.sub}
    </div>
    <div
      style={{
        position: "absolute",
        left: 72,
        top: 540,
        width: 936,
        height: 650,
        borderRadius: 22,
        background: C.panel,
        border: "1px solid #2a405e",
      }}
    />
    <div style={{ position: "absolute", left: 84, top: 1228, width: 912 }}>
      <div
        data-fit="big"
        style={{
          fontSize: part.big.length > 43 ? 31 : 35,
          color: C.teal,
          fontWeight: 700,
          lineHeight: 1.35,
        }}
      >
        {part.big}
      </div>
      <div
        data-fit="detail"
        style={{
          whiteSpace: "pre-line",
          fontSize: 25,
          lineHeight: 1.6,
          color: C.muted,
          marginTop: 18,
        }}
      >
        {part.detail}
      </div>
    </div>
    <div
      style={{
        position: "absolute",
        left: 72,
        top: 1475,
        width: 936,
        height: 230,
        borderRadius: 20,
        background: "#14233a",
        borderLeft: "5px solid #4de0bd",
      }}
    />
    <div
      data-fit="source"
      style={{
        position: "absolute",
        left: 78,
        top: 1755,
        width: 915,
        fontSize: 20,
        lineHeight: 1.5,
        color: "#829bb8",
      }}
    >
      Nguồn: {part.source}
    </div>
    <div
      style={{
        position: "absolute",
        left: 76,
        top: 1838,
        width: 920,
        height: 4,
        background: "#29405d",
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 76,
        top: 1838,
        width: 920 * ((index + 1) / episode.parts.length),
        height: 4,
        background: C.teal,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: 76,
        top: 1860,
        color: "#829bb8",
        fontSize: 20,
      }}
    >
      {episode.tagline || "TỪ Ý TƯỞNG ĐẾN VIDEO"}
    </div>
    <div
      style={{
        position: "absolute",
        right: 76,
        top: 1860,
        color: "#829bb8",
        fontSize: 20,
      }}
    >
      {String(index + 1).padStart(2, "0")} /{" "}
      {String(episode.parts.length).padStart(2, "0")}
    </div>
  </AbsoluteFill>
);
registerRoot(() => (
  <Composition
    id="ShortsForge-Plate"
    component={Plate}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={1}
    defaultProps={{
      episode: { number: "05", parts: [{}] },
      part: {
        eyebrow: "",
        heading: "",
        sub: "",
        big: "",
        detail: "",
        source: "",
      },
      index: 0,
    }}
  />
));
