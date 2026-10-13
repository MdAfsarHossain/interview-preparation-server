import z from "zod";

const updateUserStatus = z.object({
  body: z.object({
    status: z.enum(["ACTIVE", "INACTIVE", "BLOCKED"], {
      required_error: "status is required!",
    }),
  }),
});

export const AdminValidation = {
  updateUserStatus,
};
