import { memo, useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import * as lorelei from '@dicebear/lorelei';
import { getAvatarPreset } from './avatar-presets';

/** 与原消息头像使用相同的编号、部件和黑白配色。 */
export const RandomNumAvatar = memo(function RandomNumAvatar({ num }: { num: number }) {
  const src = useMemo(() => {
    const normalized = ((Math.trunc(num) % 300) + 300) % 300;
    const preset = getAvatarPreset(normalized, normalized < 150 ? 'male' : 'female');
    const svg = createAvatar(lorelei, {
      seed: `rand-avatar-${normalized}`, size: 256,
      hair: [preset.hair], eyes: [preset.eyes], mouth: [preset.mouth],
      eyebrows: [preset.brows], nose: [preset.nose], head: [preset.head],
      hairColor: ['000000'], skinColor: ['ffffff'], eyesColor: ['000000'], mouthColor: ['000000'],
      beardProbability: 0, glassesProbability: 0, earringsProbability: 0,
      frecklesProbability: 0, hairAccessoriesProbability: 0,
    } as Parameters<typeof createAvatar>[1]).toString()
      .replace(/fill="#(?:[a-fA-F0-9]{8}|[a-fA-F0-9]{6}|[a-fA-F0-9]{4}|[a-fA-F0-9]{3})"/g,
        (fill) => /^fill="#(?:fff|ffffff)"$/i.test(fill) ? fill : 'fill="#000"')
      .replace(/stroke="#[a-fA-F0-9]{3,8}"/g, 'stroke="#000"');
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [num]);
  return <img src={src} alt="" width="48" height="48" style={{ width: '1em', height: '1em' }} />;
});
