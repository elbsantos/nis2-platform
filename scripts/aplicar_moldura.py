#!/usr/bin/env python3
"""
Aplica a moldura de marca CISPLAN (cabeçalho + rodapé de página + A4) a um template .docx,
SEM tocar nos placeholders/loops do docxtemplater ({...}, {#...}{/...}).

Uso:
    python aplicar_moldura.py <template.docx> <PSI_referencia.docx> \
        --header-esq "TÍTULO DO DOC  |  CONFIDENCIAL" \
        --header-dir "Art. XX DL 125/2025" \
        --footer "Nota legal do documento"

Trabalha numa cópia (<template>.novo.docx); nunca escreve por cima do original.
Valida no fim: abre com python-docx e confirma que os placeholders continuam presentes.
"""
import sys, re, shutil, zipfile, os, argparse, tempfile

def read_zip_member(path, member):
    with zipfile.ZipFile(path) as z:
        try:
            return z.read(member).decode('utf-8')
        except KeyError:
            return None

def list_placeholders(docx_path):
    xml = read_zip_member(docx_path, 'word/document.xml') or ''
    # remove tags para juntar runs partidos, depois procura {…}
    # (o docxtemplater pode partir {empresa} em varios runs; juntamos o texto)
    text = re.sub(r'<[^>]+>', '', xml)
    return sorted(set(re.findall(r'\{[^}]+\}', text)))

def build_header_xml(psi_header, esq, dir_):
    h = psi_header
    # substituir os 2 textos do header do PSI pelos deste documento
    h = h.replace('POLÍTICA DE SEGURANÇA DA INFORMAÇÃO (PSI)  |  CONFIDENCIAL  |  Versão ___', esq)
    h = h.replace('Art. 21.º NIS2  ·  DL 125/2025', dir_)
    return h

def build_footer_xml(psi_footer, nota):
    return psi_footer.replace(
        'Art. 21.º Diretiva NIS2  ·  DL 125/2025  ·  ISO/IEC 27001:2022  ·  Documento interno — não distribuir externamente sem autorização',
        nota)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('template')
    ap.add_argument('psi')
    ap.add_argument('--header-esq', required=True)
    ap.add_argument('--header-dir', required=True)
    ap.add_argument('--footer', required=True)
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    out = args.out or (os.path.splitext(args.template)[0] + '.novo.docx')

    # placeholders ANTES (para comparar depois)
    ph_before = list_placeholders(args.template)

    # extrair para pasta temporária
    tmp = tempfile.mkdtemp()
    with zipfile.ZipFile(args.template) as z:
        z.extractall(tmp)

    # 1) header/footer do PSI, adaptados
    psi_h = read_zip_member(args.psi, 'word/header1.xml')
    psi_f = read_zip_member(args.psi, 'word/footer1.xml')
    psi_t = read_zip_member(args.psi, 'word/theme/theme1.xml')
    if not (psi_h and psi_f):
        print("ERRO: PSI sem header1.xml/footer1.xml"); sys.exit(1)

    os.makedirs(os.path.join(tmp, 'word'), exist_ok=True)
    open(os.path.join(tmp,'word','header1.xml'),'w',encoding='utf-8').write(
        build_header_xml(psi_h, args.header_esq, args.header_dir))
    open(os.path.join(tmp,'word','footer1.xml'),'w',encoding='utf-8').write(
        build_footer_xml(psi_f, args.footer))
    # theme (se o template não tiver, adiciona; se tiver, substitui pelo do PSI p/ coerência de cor)
    if psi_t:
        os.makedirs(os.path.join(tmp,'word','theme'), exist_ok=True)
        open(os.path.join(tmp,'word','theme','theme1.xml'),'w',encoding='utf-8').write(psi_t)

    # 2) rels: adicionar header/footer
    rels_path = os.path.join(tmp,'word','_rels','document.xml.rels')
    rels = open(rels_path, encoding='utf-8').read()
    used = [int(x) for x in re.findall(r'Id="rId(\d+)"', rels)] or [0]
    hid, fid = f"rId{max(used)+1}", f"rId{max(used)+2}"
    if 'header1.xml' not in rels:
        rels = rels.replace('</Relationships>',
            f'<Relationship Id="{hid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
            f'<Relationship Id="{fid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
            '</Relationships>')
    open(rels_path,'w',encoding='utf-8').write(rels)

    # 3) [Content_Types].xml: overrides
    ct_path = os.path.join(tmp,'[Content_Types].xml')
    ct = open(ct_path, encoding='utf-8').read()
    if '/word/header1.xml' not in ct:
        ct = ct.replace('</Types>',
            '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
            '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
            '</Types>')
    # garantir declaração do theme (se o template não tinha theme antes)
    if '/word/theme/theme1.xml' not in ct and psi_t:
        ct = ct.replace('</Types>',
            '<Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
            '</Types>')
    open(ct_path,'w',encoding='utf-8').write(ct)

    # 4) document.xml: referencias no sectPr + A4 + margens (SEM tocar no corpo/placeholders)
    doc_path = os.path.join(tmp,'word','document.xml')
    doc = open(doc_path, encoding='utf-8').read()
    # 4.0) garantir o namespace de relações (xmlns:r) na tag <w:document> raiz.
    #      Templates "nus" (nunca exportados do Word) podem não o ter; o r:id do
    #      headerReference precisa dele. Injetar só se estiver em falta.
    R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    if 'xmlns:r=' not in doc:
        doc = re.sub(r'(<w:document\b)', r'\1 xmlns:r="' + R_NS + '"', doc, count=1)
    if 'headerReference' not in doc:
        doc = re.sub(r'(<w:sectPr[^>]*>)',
            r'\1<w:headerReference w:type="default" r:id="'+hid+r'"/><w:footerReference w:type="default" r:id="'+fid+r'"/>',
            doc, count=1)
    # A4 (troca qualquer pgSz Letter; se já for A4, não faz nada)
    doc = doc.replace('<w:pgSz w:w="12240" w:h="15840"/>', '<w:pgSz w:w="11906" w:h="16838"/>')
    # margens consistentes
    doc = re.sub(r'<w:pgMar[^>]*/>',
        '<w:pgMar w:top="1100" w:right="1200" w:bottom="1100" w:left="1200" w:header="708" w:footer="708" w:gutter="0"/>',
        doc, count=1)
    open(doc_path,'w',encoding='utf-8').write(doc)

    # empacotar
    if os.path.exists(out): os.remove(out)
    zf = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    # Content_Types primeiro
    zf.write(ct_path, '[Content_Types].xml')
    for root, _, files in os.walk(tmp):
        for fn in files:
            full = os.path.join(root, fn)
            arc = os.path.relpath(full, tmp)
            if arc == '[Content_Types].xml': continue
            zf.write(full, arc)
    zf.close()
    shutil.rmtree(tmp)

    # VALIDAÇÃO (se falhar, apaga o output para não deixar lixo corrompido em disco)
    try:
        from docx import Document
        Document(out)  # abre sem corromper?
    except Exception as e:
        if os.path.exists(out): os.remove(out)
        print(f"ERRO: ficheiro gerado não abre: {e}"); sys.exit(2)

    ph_after = list_placeholders(out)
    if ph_before != ph_after:
        if os.path.exists(out): os.remove(out)
        print("ERRO: placeholders mudaram!")
        print("  antes:", ph_before)
        print("  depois:", ph_after)
        sys.exit(3)

    print(f"OK: {out}")
    print(f"  placeholders preservados ({len(ph_after)}): {ph_after}")

if __name__ == '__main__':
    main()
