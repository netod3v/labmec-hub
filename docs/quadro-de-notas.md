# Quadro das notas

O desenho continua salvo em `private_notes` da própria conta. As preferências
do quadro ficam em `whiteboardPreferences` no mesmo documento, sincronizadas
com as notas. Desenhos anteriores sem esses campos usam os padrões.

## Ferramentas

- Duas canetas com cor, espessura e estilo independentes; marca-texto e laser.
  O laser desaparece e não entra nas notas, no histórico ou nas exportações.
- Linha, retângulo, círculo/elipse, triângulo e projeções de cubo, cilindro,
  pirâmide e esfera. As formas tridimensionais são ilustrações em perspectiva.
- Carimbo da logo, seleção com movimento e redimensionamento pelos cantos,
  laço para objetos/traços inteiramente dentro da região e recorte por área.
- Texto, com edição por duplo clique, imagens PNG/JPG/WebP e páginas de PDF.
  Imagens e páginas importadas tornam-se objetos gráficos redimensionáveis.
- Exportação PNG e PDF de uma página A4, com fundo, sem seleção nem laser.
  PDFs de entrada com várias páginas oferecem escolha da página a inserir.
- Recolher a barra mantém o quadro utilizável; o botão Ferramentas de desenho
  permite abri-la novamente.
- Arraste a alça de pontinhos para reposicionar a barra dentro do quadro.
  As setas do teclado ajustam a posição quando a alça está focada. Dois cliques
  ou Home restauram a posição inicial. Os menus se adaptam às bordas do quadro.

## Configurações e padrões

Reconhecimento ligado para linha, círculo, retângulo e triângulo. Um traço
fechado próximo da forma é reconhecido ao manter o ponteiro parado por 500 ms;
linhas quase retas também são ajustadas ao soltar. É possível desligar o
reconhecimento ou escolher apenas algumas formas.

O scroll aplica zoom por padrão. Alternativas: ignorar ou fazer pan vertical
com zoom pelo modificador configurado. O zoom mantém a posição do ponteiro.
Fundo liso, quadriculado ou pontilhado e cor do fundo são configuráveis.
Ferramentas podem ser ocultadas; Configurações e Reabrir permanecem acessíveis.

Atalhos iniciais: P (caneta 1), H (caneta 2), E (borracha), T (texto),
Espaço+arrastar (pan), Ctrl segurado (linha reta), Ctrl+scroll (zoom no modo pan),
Ctrl+Z/Y (desfazer/refazer) e Delete (apagar seleção). Esses atalhos são
editáveis. Ctrl+C/V e Esc permanecem fixos. Campos de texto e diálogos
preservam sua edição normal. Restaurar padrões repõe todas as preferências.

## Arquivos e validação

PDF.js 6.4.299 é servido localmente; a importação ocorre no navegador com
avaliação de JavaScript e XFA desativados. Arquivos de entrada limitados a
10 MB; imagens são normalizadas para PNG e até 1600 pixels no lado maior.
Objetos gráficos grandes demais para o documento são recusados antes de salvar.
PDFs protegidos precisam de uma cópia desbloqueada.

Testes:

```text
node backend/tests/test_whiteboard_model.cjs
node backend/tests/test_note_drawing_area.cjs
```

O teste de navegador usa `playwright-core` via `PLAYWRIGHT_MODULE` e o caminho
do navegador em `EDGE_EXECUTABLE`. Usa conta, desenhos e arquivos fictícios,
sem acessar dados de produção. Cobre regressões do desenho, reconhecimento,
seleção/redimensionamento, atalhos e preferências, arquivos e CSP, além dos
layouts de desktop, tablet e celular.


## Celular e tablet

- O editor ocupa a janela em telas de até 1024 px e em tablets de toque de até 1366 px, com controles de toque de pelo menos 44 px.
- As ferramentas principais ficam na barra; formas, laser e outras ferramentas ficam acessíveis pelo botão **+**.
- Um dedo desenha. Dois dedos movem o quadro e o gesto de pinça ajusta o zoom sem gerar traços.
- Ao usar uma caneta digital, toques simultâneos no quadro são ignorados durante o traço.
- Os painéis se ajustam à orientação e respeitam os limites do quadro. A barra continua podendo ser arrastada ou recolhida.
- A validação automatizada usa emulação Chromium em 320×568, 390×844, 768×1024, 1024×768, 1366×1024 e 844×390, incluindo gestos de toque. Isso não substitui a verificação em aparelhos reais.
