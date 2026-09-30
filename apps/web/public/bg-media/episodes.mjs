/** Curated public MIXX TANK uploads verified 2026-09-30. Not a live-event feed.
 * Keep title/thumbnail/video ID paired. Publishing changes on YouTube is separate.
 */
export const CHANNEL = 'https://www.youtube.com/@MixxTankProductions';
export const EPISODES = Object.freeze([
  {id:'Lp71Y_h9ZmM', episode:1, title:'2 Clubs Battle for $11,000', duration:'24:12'},
  {id:'zNaXMhUye7k', episode:2, title:'Jason Callori Blind Judges Our Single Barrel', duration:'25:17'},
  {id:'N2aIKmpguVA', episode:3, title:'Arkansas VS Florida Compete in Matt Madness', duration:'34:12'},
  {id:'_2eh87yEy9Q', episode:4, title:'2 Bourbon Clubs, Only 1 Winner', duration:'26:24'}
].map(Object.freeze));
export function videoUrl(id, embed = false) {
  if (!EPISODES.some(episode => episode.id === id)) throw new Error('Choose a listed MIXX TANK episode.');
  return embed ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&controls=1&rel=0` : `https://www.youtube.com/watch?v=${id}`;
}
