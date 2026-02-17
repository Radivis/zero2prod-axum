export const ROUTES = {
  adminBlog: '/admin/blog',
  adminBlogNew: '/admin/blog/new',
  adminBlogEditPath: '/admin/blog/:id/edit',
  adminBlogEdit: (id: string) => `/admin/blog/${id}/edit`,
} as const
