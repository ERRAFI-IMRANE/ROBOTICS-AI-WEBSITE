const ALBUM_FILE_NAMES = Object.freeze([
  "1.jpg", "2.JPG", "3.jpg", "4.jpg", "5.jpg", "6.jpg",
  "7.jpg", "8.jpg", "9.jpg", "10.jpg", "11.jpg", "12.jpg",
  "13.jpg", "14.jpg", "15.jpg", "16.jpg", "17.jpg", "18.JPG",
  "19.jpg", "20.jpg", "21.jpg", "22.jpg", "23.jpg", "24.jpg",
]);

export const ALBUM_PHOTOS = Object.freeze(ALBUM_FILE_NAMES.map((fileName, index) => Object.freeze({
  id: `album-${index + 1}`,
  title: `Club Milestone ${index + 1}`,
  src: `/album/${fileName}`,
  alt: `Robotics & AI Club Photo ${index + 1}`,
  link: "https://www.instagram.com/robotics_aiclub.ests/",
})));

export function shufflePhotos(photos) {
  const shuffled = [...photos];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

export function pickRandomAlbumPhotos(count = 7) {
  return shufflePhotos(ALBUM_PHOTOS).slice(0, Math.max(0, Math.min(count, ALBUM_PHOTOS.length)));
}
