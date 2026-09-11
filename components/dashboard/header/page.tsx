function Header({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <h2 className="text-lg font-semibold text-foreground dark:text-dark-text-primary">{title}</h2>
      <p className="text-sm text-muted-foreground dark:text-dark-text-secondary">
        {description}
      </p>
    </header>
  )
}

export default Header