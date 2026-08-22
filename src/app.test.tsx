import { render, screen } from '@testing-library/react'
import { App } from './App'

it('monterar appen', () => {
  render(<App />)
  expect(screen.getByText('Text-TV')).toBeInTheDocument()
})
