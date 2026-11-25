export const heroes = [
  'Adam Warlock','Angela','Black Cat','Black Panther','Black Widow','Blade','Captain America','Cloak & Dagger',
  'Cyclops','Daredevil','Deadpool','Devil Dinosaur','Doctor Strange','Elsa Bloodstone','Emma Frost','Gambit',
  'Gorr the God Butcher','Groot','Hawkeye','Hela','Hulk','Human Torch','Invisible Woman','Iron Fist',
  'Iron Man','Jeff the Land Shark','Jubilee','Loki','Luna Snow','Magik','Magneto','Mantis','Mister Fantastic',
  'Moon Knight','Namor','Nightcrawler','Peni Parker','Phoenix','Psylocke','Rocket Raccoon','Rogue',
  'Scarlet Witch','Spider-Man','Squirrel Girl','Star-Lord','Storm','The Hood','The Punisher','The Thing',
  'Thor','Ultron','Venom','White Fox','Winter Soldier','Wolverine'
];
export const tiers = [
  ['Agent',0],['Knight',5],['Captain',15],['Centurion',30],['Lord',50],['Count',80],
  ['Colonel',110],['Warrior',140],['Elite',170],['Guardian',200],['Champion (Level 50)',230],
  ...Array.from({ length: 4 }, (_, i) => [`Level ${55 + i * 5}`, 290 + i * 60])
];
const specialPrices = {
  'Adam Warlock': [100, 300, 700],
  'Mantis': [100, 300, 700],
  'Mister Fantastic': [65, 185, 400],
  'Ultron': [100, 300, 700],
  'White Fox': [55, 145, 300]
};
// Special character rates are cumulative at levels 20, 50 and 70.
// Intermediate five-level tiers are linearly interpolated between anchors.
function cumulativePrice(hero, tierIndex) {
  const anchors = specialPrices[hero];
  if (!anchors) return tiers[tierIndex][1];
  const level = tierIndex * 5;
  if (level <= 20) return anchors[0] * level / 20;
  if (level <= 50) return anchors[0] + (anchors[1] - anchors[0]) * (level - 20) / 30;
  return anchors[1] + (anchors[2] - anchors[1]) * (level - 50) / 20;
}
export const boostPrice = (hero, start, end) =>
  Math.round((cumulativePrice(hero, end) - cumulativePrice(hero, start)) * 100) / 100;
