import { ALBUM_PHOTOS, shufflePhotos } from "../../data/albumPhotos";

const JOIN_VISUALS = [
  { src: "/why-join/why_join_main.jpg", alt: "Autonomous Rover & AI Lab" },
  { src: "/why-join/why_join_gold.jpg", alt: "Competition Arena & Bot Chassis" },
  { src: "/why-join/why_join_tee_black.jpg", alt: "Official Club Engineering Gear" },
  { src: "/why-join/why_join_tee_white.jpg", alt: "Robotics & AI Club Gear" },
];

const gallery = shufflePhotos([
  ...ALBUM_PHOTOS.map(({ src, alt }) => ({ src, alt })),
  ...JOIN_VISUALS,
]);
const midpoint = Math.ceil(gallery.length / 2);

// Every image participates in the two seamless tracks. The order changes once
// per page load while each duplicated track remains internally consistent.
export const NAV_GALLERY_COLUMN_ONE = Object.freeze(gallery.slice(0, midpoint));
export const NAV_GALLERY_COLUMN_TWO = Object.freeze(gallery.slice(midpoint));
