export default function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex-1 w-full bg-gray-50 dark:bg-dark-page">
      <div className="p-0">
        {children}
      </div>
    </div>
  )
}