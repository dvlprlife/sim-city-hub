// A little CSS-drawn isometric person (no image assets) — head + torso + legs,
// coloured from an avatar's { shirt, skin?, hat? }. The figure itself carries no
// positioning; callers wrap it in a positioned/animated element (scene-avatar /
// scene-ped / avatar-preview). `scale` sizes it (parts scale via the --s var);
// add `seated` to the className to hide the legs (sitting at a desk).
export default function IsoPerson({ avatar = {}, className = '', scale = 1 }) {
  const style = {
    '--s': scale,
    '--shirt': avatar.shirt || '#3b6fb0',
    '--skin': avatar.skin || '#e8b98a',
    '--hat': avatar.hat || 'transparent',
  };
  return (
    <span className={`iso-person ${className}`} style={style} aria-hidden="true">
      <span className="ip-legs" />
      <span className="ip-body" />
      <span className="ip-head" />
      <span className="ip-hat" />
    </span>
  );
}
