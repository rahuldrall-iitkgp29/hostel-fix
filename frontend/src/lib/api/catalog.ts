import { z } from "zod";
import type { ApiClient } from "./client";

export const catalogHostelSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
});
export type CatalogHostel = z.infer<typeof catalogHostelSchema>;

export const catalogBlockSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
});
export type CatalogBlock = z.infer<typeof catalogBlockSchema>;

export const catalogRoomSchema = z.object({
  id: z.string(),
  hostelId: z.string(),
  blockId: z.string(),
  label: z.string(),
});
export type CatalogRoom = z.infer<typeof catalogRoomSchema>;

export async function getHostels(client: ApiClient) {
  const response = await client.request("/catalog/hostels", z.array(catalogHostelSchema), {
    query: { limit: 100 },
  });
  return response.data;
}

export async function getHostelBlocks(client: ApiClient, hostelId: string) {
  const response = await client.request(
    `/catalog/hostels/${encodeURIComponent(hostelId)}/blocks`,
    z.array(catalogBlockSchema)
  );
  return response.data;
}

export async function getRooms(client: ApiClient, hostelId: string, blockId: string) {
  const response = await client.request("/catalog/rooms", z.array(catalogRoomSchema), {
    query: { hostelId, blockId, limit: 100 },
  });
  return response.data;
}
