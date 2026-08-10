#!/usr/bin/env node
// Reads a JSON document from stdin and prints its key fields, the way an AI
// agent or harness would consume the output. Optional argv[2]: a substring
// that must appear in the document (message / tails / command) for the check
// to pass.
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => (input += chunk))
process.stdin.on('end', () => {
  let doc
  try {
    doc = JSON.parse(input)
  } catch (err) {
    console.error(`stdout is NOT valid JSON: ${err.message}`)
    process.exit(1)
  }
  console.log('stdout is valid JSON')
  console.log(`schema:     ${doc.schema}`)
  console.log(`mode:       ${doc.mode ?? 'n/a'}`)
  console.log(`errorType:  ${doc.error?.errorType ?? doc.errorType ?? 'n/a'}`)
  console.log(`message:    ${doc.error?.message ?? doc.message ?? 'n/a'}`)
  console.log(`location:   ${doc.location ?? 'n/a'}`)
  if (doc.error?.stdoutTail) {
    const tail = doc.error.stdoutTail
    const shown = tail.length > 500 ? `...last line: ${tail.trim().split('\n').at(-1)}` : JSON.stringify(tail)
    console.log(`stdoutTail (${tail.length} chars): ${shown}`)
  }
  if (doc.error?.stderrTail) {
    console.log(`stderrTail: ${JSON.stringify(doc.error.stderrTail)}`)
  }
  const expect = process.argv[2]
  if (expect) {
    const haystack = [
      doc.message,
      doc.error?.message,
      doc.error?.stdoutTail,
      doc.error?.stderrTail,
      doc.command,
    ]
      .filter(Boolean)
      .join('\n')
    if (!haystack.includes(expect)) {
      console.error(`FAIL: expected substring "${expect}" not found in the document`)
      process.exit(1)
    }
    console.log(`contains "${expect}": yes`)
  }
})
