/** Gone Girl as TMDB answers it (details, credits, videos, recommendations). */
export const GONE_GIRL = {
  id: 210577,
  title: "Gone Girl",
  original_language: "en",
  overview: "Une femme disparaît le jour de ses cinq ans de mariage.",
  tagline: "Vous ne la connaissez pas.",
  genres: [
    { id: 18, name: "Drame" },
    { id: 53, name: "Thriller" },
  ],
  vote_average: 7.9,
  vote_count: 19000,
  runtime: 149,
  release_date: "2014-10-01",
  poster_path: "/gone.jpg",
  credits: {
    cast: [{ name: "Ben Affleck" }, { name: "Rosamund Pike" }, { name: "Neil Patrick Harris" }],
    crew: [
      { name: "David Fincher", job: "Director" },
      { name: "Jeff Cronenweth", job: "Director of Photography" },
    ],
  },
  videos: {
    results: [
      { site: "YouTube", key: "en-trailer", type: "Trailer", iso_639_1: "en" },
      { site: "YouTube", key: "fr-trailer", type: "Trailer", iso_639_1: "fr" },
    ],
  },
  recommendations: {
    results: [
      {
        id: 146233,
        media_type: "movie",
        title: "Prisoners",
        genre_ids: [18, 53, 80],
        original_language: "en",
        release_date: "2013-09-19",
        vote_average: 8.1,
        vote_count: 12000,
        poster_path: "/prisoners.jpg",
      },
      { name: "sans numéro" },
    ],
  },
};
