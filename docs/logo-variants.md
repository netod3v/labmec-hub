# Variantes da logo LABIOMEC

- Original preservado: `assets/labiomec-logo.png`.
- Azul sem fundo: `assets/labiomec-logo-transparent.png`.
- Branca sem fundo: `assets/labiomec-logo-white.svg`.

A extração foi feita com a ferramenta integrada image_gen, em modo de edição com transparência. A versão branca usa um filtro SVG sobre o mesmo canal alfa da versão azul, preservando a mesma geometria e evitando uma nova geração dos traços. O SVG incorpora o PNG e pode ser usado como arquivo independente. No site, as imagens de primeiro plano usam o mesmo efeito por CSS nos temas escuro e preto.

## Prompt final da extração

Use case: background-extraction. Edit target: the supplied LABORATÓRIO DE BIOMECÂNICA UFRJ logo, not a style reference. Remove only the white background to create a clean transparent PNG. Preserve the exact existing navy and grey artwork, the helmeted woman's profile, anatomical runner, enclosing arc and dotted circle, all fine lines and existing gradients, lettering, spacing and proportions. Exact text must remain LABORATÓRIO DE BIOMECÂNICA UFRJ, including the accents. Do not redesign, redraw, simplify or replace the logo. White negative-space regions, including those inside the line artwork, should be transparent so the mark works over website backgrounds. Center the complete logo with a small safe transparent margin; no clipped artwork, no added glow/shadow, no backdrop, no mockup. Output one navy/grey transparent logo asset.

## Variante branca

Aplicar branco ao canal alfa da logo azul, sem mudar desenho, texto, dimensões ou transparência. Implementado com `feFlood` e `feComposite` no SVG; não usa a geração de imagem para redesenhar a marca.
