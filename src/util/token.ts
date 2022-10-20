export const maxIndex = 16383;

/*
tokenPatterns represents the first 16384 (2^14) possible permutations of page tokens. This is my first stab at reverse
engineering the token logic, there appears to be a pattern to things but not enough for me to know how to simplify
the conversion logic beyond the current implementation. After 16384 the pattern changes and I haven't bothered trying
to parse it yet.

A token (e.g. EAAaB1BUOkNMWUE) is composed of:
* a constant prefix (EAAaB1BUOkN)
* first digit (M): increments every time middle digit wraps around
* middle digit (WU): increments with every page, two characters with a prefix and suffix
    prefix changes every subsequent page and suffixes correspond to the prefix, no discernible logic to how they're grouped
* a last digit (E): increments every time first digit wraps around
 */
const tokenPatterns: [first: string, middle: [prefix: string, suffix: string][], last: string][] = [
  ["JKLMNOPQ", [["QRSTUVW", "U"], ["YZabcd", "0"], ["MNO", "E"]], "EIMQUYcgkosw048"],
  ["JKLMNOPQ", [["QRSTUVW", "V"], ["YZabcd", "1"], ["MNO", "F"]], "AEIMQUYcgko"],
  ["JKLMNOPQ", [["QRSTUVW", "W"], ["YZabcd", "2"], ["MNO", "G"]], "EIMQUYcgkosw048"],
  ["JKLMNOPQ", [["QRSTUVW", "X"], ["YZabcd", "3"], ["MNO", "H"]], "AEIMQUYcgko"],
  ["JKLMNOPQ", [["QRSTUVW", "T"], ["YZabcd", "z"], ["MNO", "D"]], "AEIMQUYcgk"],
  ["JKLMNOPQ", [["QRSTUVW", "S"], ["YZabcd", "y"], ["MNO", "C"]], "0"],
  ["JKLMNOPQ", [["QRSTUVW", "V"], ["YZabcd", "1"], ["MNO", "F"]], "8"],

  ["JKLMNOPQ", [["QRSTUVW", "k"], ["Zabcde", "E"], ["MNO", "U"]], "EIMQUYcgkosw048"],
  ["JKLMNOPQ", [["QRSTUVW", "1"], ["Zabcde", "F"], ["MNO", "V"]], "AEIMQUYcgko"],
  ["JKLMNOPQ", [["QRSTUVW", "m"], ["Zabcde", "G"], ["MNO", "W"]], "EIMQUYcgkosw048"],
  ["JKLMNOPQ", [["QRSTUVW", "n"], ["Zabcde", "H"], ["MNO", "X"]], "AEIMQUYcgko"],
  ["JKLMNOPQ", [["QRSTUVW", "j"], ["Zabcde", "D"], ["MNO", "T"]], "AEIMQUYcgk"],
  ["JKLMNOPQ", [["QRSTUVW", "i"], ["Zabcde", "C"], ["MNO", "S"]], "0"],
  ["JKLMNOPQ", [["QRSTUVW", "l"], ["Zabcde", "F"], ["MNO", "V"]], "8"]
];

export const indexToToken = (index: number): string => {
  if (index < 0 || index > maxIndex) {
    throw new Error("invalid index provided");
  }

  let total = 0;
  for (const [first, middle, last] of tokenPatterns) {
    // Iterate over tokenPatterns and calculate the length of each pattern subset. This lets us figure out which pattern
    // subset our token is in.
    const middlePermutations = middle.reduce((total, [prefix]) => {
      return total + prefix.length;
    }, 0);
    const patternPermutations = first.length * middlePermutations * last.length;
    total += patternPermutations;

    if (index < total) {
      // create a map of each middle digit prefix to its corresponding suffix
      const middleSuffixes = middle.reduce((map, [prefix, suffix]) => {
        const prefixes = { ...map };
        prefix.split("").forEach(p => {
          prefixes[p] = suffix;
        });
        return prefixes;
      }, {});

      // middle digit prefix increments with each page
      const middlePrefix = Object.keys(middleSuffixes)[index % middlePermutations];
      const middleSuffix = middleSuffixes[middlePrefix];

      // offsetIndex is how far the provided index sits within the current pattern subset
      const offsetIndex = index - (total - patternPermutations);
      // first digit increments every time middle digit wraps around
      const firstDigit = first[Math.trunc(offsetIndex / middlePermutations) % first.length];
      // last digit increments every time first digit wraps around
      const lastDigit = last[Math.trunc(offsetIndex / (middlePermutations * first.length)) % last.length];

      return `EAAaB1BUOkN${firstDigit}${middlePrefix}${middleSuffix}${lastDigit}`;
    }
  }
  return "";
};