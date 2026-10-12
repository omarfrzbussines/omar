# Cuadro "DASHBOARD POR ASESOR" — pestaña 2. COLA RENOVAR (VENTAS RETENCIÓN 2026 V2)

## Fórmulas anteriores (respaldo, 12-oct-2026)
Problema: PROYECCIÓN sumaba solo filas 11-250 y YA COBRADO filas 11-992 → FALTA COBRAR negativo
(oct-2026 TODOS: 250 / 3,188 / -2,938). Además el día HASTA no entraba si la fecha tenía hora.

- Z5  `=SUMPRODUCT(($K$11:$K$250=IF($AA$3="TODOS",$K$11:$K$250,$AA$3))*ISNUMBER($S$11:$S$250)*($S$11:$S$250>=IF($AD$3="",0,$AD$3))*($S$11:$S$250<=IF($AF$3="",2958465,$AF$3))*IFERROR($N$11:$N$250+0,0))`
- AC5 `=SUMPRODUCT(($K$11:$K$992=IF($AA$3="TODOS",$K$11:$K$992,$AA$3))*($O$11:$O$992="SÍ")*($S$11:$S$992>=IF($AD$3="",0,$AD$3))*($S$11:$S$992<=IF($AF$3="",99999,$AF$3))*IFERROR($N$11:$N$992+0,0))`
- AF5 `=Z5-AC5`
- Z7  `=SUMPRODUCT(($K$11:$K$250=IF($AA$3="TODOS",$K$11:$K$250,$AA$3))*($K$11:$K$250<>""))`
- AC7 `=SUMPRODUCT(($K$11:$K$250=IF($AA$3="TODOS",$K$11:$K$250,$AA$3))*($O$11:$O$250="SÍ"))`
- AF7 `=IFERROR(AC7/Z7,0)`

## Fórmulas nuevas
Todas las filas desde la 8 hasta el final, fecha de cobro (S) entre DESDE y HASTA (día HASTA completo).
CLIENTES y RENOVADOS ahora también respetan las fechas: clientes = cobros con fecha en el rango,
renovados = de esos, los que tienen RENOVADO? = SÍ.

- Z5  PROYECCIÓN: `SUMIFS(N, S >= DESDE, S < HASTA+1 [, K = asesor])`
- AC5 YA COBRADO: lo mismo + `O = "SÍ"`
- Z7  CLIENTES: `COUNTIFS` con las mismas fechas (y asesor)
- AC7 RENOVADOS: lo mismo + `O = "SÍ"`
- AF5 y AF7 sin cambios.

Verificado oct-2026, TODOS: PROYECCIÓN 17,688 · YA COBRADO 5,066 · FALTA 12,622 · CLIENTES 26 ·
RENOVADOS 7 (26.9 %). Coincide con la suma fila por fila hecha aparte.

Ojo: las fechas escritas como texto en S no cuentan (ej. fila 267 `f30/10/26`, S/750 de MONICA;
y varias `dd/mm/aaaa` de junio-agosto). Corregirlas a fecha para que entren.
