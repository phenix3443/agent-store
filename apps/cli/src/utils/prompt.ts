import { createInterface } from 'readline'

export type Prompter = (question: string) => Promise<string>

export function createReadlinePrompter(): Prompter {
  return (question: string): Promise<string> =>
    new Promise(resolve => {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      rl.question(question, answer => {
        rl.close()
        resolve(answer)
      })
    })
}
