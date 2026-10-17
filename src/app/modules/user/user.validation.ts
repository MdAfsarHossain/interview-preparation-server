import z from "zod";

const updateUser = z.object({
  body: z.object({
    name: z.string().optional(),
    avatar: z.string().optional(),
  }),
});

export const UserValidation = {
  updateUser,
};
