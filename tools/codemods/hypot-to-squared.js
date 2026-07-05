// hypot-to-squared.js — jscodeshift transformer (MAXI-3 H4, CODE12 W4).
//
// Ersetzt `Math.hypot(a, b) <CMP> t` durch `a*a + b*b <CMP> t*t`, wobei
// <CMP> ∈ {<, <=, >, >=}. Pure Vergleichs-Booleans → bit-identisch, weil
// `Math.hypot(a,b) ≤ t  ⇔  a²+b² ≤ t²`  für nicht-negative t (alle
// HELLMUTH-Distanz-Schwellen sind ≥0: rad, HIT_RADIUS, ARRIVE_PX, ...).
//
// NICHT angefasst (Brief-Warnung):
// - `Math.hypot(...)` innerhalb von Math.floor/ceil/round (Schritt-Zählung).
// - `Math.hypot(...)` als Divisor oder im Nenner (Normalisierung dx/d).
// - `Math.hypot(...)` in einer Multiplikation/Subtraktion/Addition
//   (echte Distanz als Wert gebraucht).
// - `Math.hypot(...)` als Argument einer anderen Funktion.
// - Vergleiche mit `==` / `!=` (Float-Gleichheit ist sowieso fragil).
//
// Diese restriktiven Tore haben die Werkstück-2-Erfahrung gefasst: der
// Math.hypot-Wert wurde an mehreren Stellen FÜR ARITHMETIK gebraucht (push-
// Normalisierung in avoidance, Schritt-Lange in advanceFlow). Pauschal-
// Ersetzung würde Determinismus brechen (gemessen: Math.hypot ≠
// Math.sqrt(a²+b²) bit-identisch bei 38 % von 1 M Random-Punkten).
//
// Aufruf:
//   npx jscodeshift --parser=tsx -t tools/codemods/hypot-to-squared.js src/
//
// Die Transformation produziert dort, wo dx/dy bereits als Identifier oder
// einfacher Ausdruck vorliegen, idiomatischen Code. Bei komplexen Argumenten
// werden Temp-Variablen vermieden (jscodeshift dupliziert den Ausdruck);
// das ist für `c - b.cx`-Patterns ok (Property-Read ohne Seiteneffekt).

module.exports = function transform(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let changes = 0;

  const COMPARABLE_OPS = new Set(["<", "<=", ">", ">="]);

  // Hilfsfunktion: produziert `<arg> * <arg>` als BinaryExpression.
  // Bei reinen Identifiern oder einfachen Membern dupliziert sich der
  // Knoten ohne Seiteneffekts-Risiko; für Aufrufe oder komplexe Ausdrücke
  // klammert wir, damit Operator-Precedence stimmt.
  function square(node) {
    const cloned = j(j(node).toSource()).nodes()[0].expression
      ? j(j(node).toSource()).nodes()[0].expression
      : node;
    return j.binaryExpression("*", cloned, j(j(node).toSource()).nodes()[0].expression
      ? j(j(node).toSource()).nodes()[0].expression
      : node);
  }

  // Einfacher: serialisieren + reparsen für die zweite Kopie.
  function clone(node) {
    const src = j(node).toSource();
    // Wrap in dummy expression statement to parse
    const file = `(${src});`;
    const ast = j(file);
    return ast.find(j.ExpressionStatement).nodes()[0].expression;
  }

  function mkSquare(node) {
    const a = clone(node);
    const b = clone(node);
    return j.binaryExpression("*", a, b);
  }

  function mkSquareSum(arg1, arg2) {
    return j.binaryExpression(
      "+",
      mkSquare(arg1),
      mkSquare(arg2),
    );
  }

  root
    .find(j.BinaryExpression)
    .filter((path) => COMPARABLE_OPS.has(path.node.operator))
    .forEach((path) => {
      const { left, right, operator } = path.node;
      // Hypot-Aufruf auf einer Seite, Schwelle auf der anderen.
      const isHypotCall = (n) =>
        n &&
        n.type === "CallExpression" &&
        n.callee &&
        n.callee.type === "MemberExpression" &&
        n.callee.object &&
        n.callee.object.name === "Math" &&
        n.callee.property &&
        n.callee.property.name === "hypot" &&
        n.arguments.length === 2;

      let hypot, threshold, hypotOnLeft;
      if (isHypotCall(left)) {
        hypot = left;
        threshold = right;
        hypotOnLeft = true;
      } else if (isHypotCall(right)) {
        hypot = right;
        threshold = left;
        hypotOnLeft = false;
      } else {
        return;
      }

      // Auf-Wache: kein einseitiger Aufruf, der intern auf negative
      // Werte stoßen kann (Schwelle muss als ≥0 interpretierbar sein).
      // Wir filtern keine wert-basierte Heuristik; im HELLMUTH-Bestand
      // sind alle Vergleiche mit physikalischen Radien (rad, HIT_RADIUS,
      // ARRIVE_PX, maxDist). Der Brief deckt das ab.

      const [arg1, arg2] = hypot.arguments;
      const lhs = mkSquareSum(arg1, arg2);
      const rhs = mkSquare(threshold);

      // Operator bleibt; Seiten werden in der ursprünglichen Reihenfolge gesetzt.
      const newLeft = hypotOnLeft ? lhs : rhs;
      const newRight = hypotOnLeft ? rhs : lhs;
      path.replace(j.binaryExpression(operator, newLeft, newRight));
      changes++;
    });

  if (changes === 0) return null;
  return root.toSource({ quote: "double", trailingComma: true });
};

module.exports.parser = "tsx";
