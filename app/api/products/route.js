// POST /api/products { name, description?, stage? }
import { addProduct } from "@/lib/store";
import { route, readJson } from "@/lib/http";

export const POST = route(async (req) => Response.json({ product: await addProduct(await readJson(req)) }, { status: 201 }));
