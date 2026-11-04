import { index, layout, route } from "@react-router/dev/routes";

export default [
  index("features/home/pages/home-redirect.tsx"),
  layout("features/game/pages/game-room-layout.tsx", [
    route("games/:id", "features/game/pages/game-room-page.tsx"),
  ]),
  route("pricing", "features/billing/features/pricing/pages/pricing-page.tsx"),
  route("robots.txt", "features/seo/pages/robots.ts"),
];
