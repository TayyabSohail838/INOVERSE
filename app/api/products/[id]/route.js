// PATCH  /api/products/:id { description?, stage? }
// DELETE /api/products/:id
import { updateProduct, removeProduct } from "@/lib/store";
import { route, readJson, idFrom } from "@/lib/http";

export const PATCH = route(async (req, ctx) => {
  const id = await idFrom(ctx);
  return Response.json({ product: await updateProduct(id, await readJson(req)) });
});

export const DELETE = route(async (req, ctx) => {
  await removeProduct(await idFrom(ctx));
  return Response.json({ ok: true });
});
