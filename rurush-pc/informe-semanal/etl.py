#!/usr/bin/env python3
"""RURUSH informe semanal - ETL completo -> data.json
Lee HOJA DE REPORTES + BASE DIARIA via Sheets API + Pipedrive API directo (canal+horarios).
Ya no depende de InscritosYCanal.gs para filas 295-316.
Uso: python3 etl.py [YYYY-MM-DD_hoy_opcional]
"""
import json,glob,os,sys,datetime
from collections import defaultdict
import openpyxl
import requests
from google.oauth2.service_account import Credentials
import google.auth.transport.requests

ASE=["MONICA","LAURA","DANNA"]
METAS={"MONICA":18000,"LAURA":11000,"DANNA":11000}   # metas del mes (mismas que RURUSH Hoy)
import re as _re
def _cred(nombre_rx):
    """Lee un token de credenciales_api.txt (carpeta del proyecto). Nunca va escrito en este archivo."""
    for base in glob.glob('/sessions/*/mnt/RURUSH VENTAS 2026/')+[os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')]:
        f=os.path.join(base,'credenciales_api.txt')
        if os.path.exists(f):
            m=_re.search(nombre_rx+r".*?Token(?:\s*Empresa)?:\s*(\S+)",open(f,encoding="utf-8",errors="ignore").read(),_re.S|_re.I)
            if m: return m.group(1)
    return None
MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]

SHEET_IDS = {
    "HOJA DE REPORTES": "1DHEBkhtGgOvSkUZDsdokVOVozHhujUF77sFUWgv9Ves",
    "ACTUALIZAR BASE DIARIA": "1uM0zdslIvTDRmB6ikKycTjFDy0rOz9dfn8jLB60adaI",
}

def _get_creds():
    # Try Linux sandbox path first, then Windows project folder
    mnt = glob.glob('/sessions/*/mnt/RURUSH VENTAS 2026/')
    if mnt:
        key = mnt[0] + 'rurush_sheets_key.json'
    else:
        key = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'rurush_sheets_key.json')
        if not os.path.exists(key):
            key = '/tmp/rurush_sheets_key.json'
    scopes = ['https://www.googleapis.com/auth/spreadsheets',
              'https://www.googleapis.com/auth/drive.readonly']
    creds = Credentials.from_service_account_file(key, scopes=scopes)
    creds.refresh(google.auth.transport.requests.Request())
    return creds

def find_xlsx(title_sub, out):
    """Descarga el sheet como xlsx via Sheets API HTTP (sin Drive MCP)."""
    sheet_id = next((v for k,v in SHEET_IDS.items() if title_sub.lower() in k.lower()), None)
    if not sheet_id:
        raise SystemExit("Sheet ID no configurado para: " + title_sub)
    creds = _get_creds()
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    resp = requests.get(url, headers={"Authorization": f"Bearer {creds.token}"})
    if resp.status_code != 200:
        raise SystemExit(f"Error descargando {title_sub}: HTTP {resp.status_code}")
    open(out, "wb").write(resp.content)
    print(f"  Descargado {title_sub}: {len(resp.content):,} bytes")
    return out

def periodo(hoy):
    d=hoy
    while d.weekday()!=6: d-=datetime.timedelta(days=1)   # ultimo domingo (fin de semana)
    dom=d; lun=dom-datetime.timedelta(days=6)              # lunes (inicio de semana)
    # Siempre 7 días completos (lun-dom), sin recortar por cambio de mes
    if lun.month==dom.month:
        rango=f"{lun.day} - {dom.day} de {MESES[dom.month-1]} {dom.year}"
    else:
        rango=f"{lun.day} de {MESES[lun.month-1]} - {dom.day} de {MESES[dom.month-1]} {dom.year}"
    return lun,dom,rango

def main():
    hoy=datetime.date.fromisoformat(sys.argv[1]) if len(sys.argv)>1 else datetime.date.today()
    sat,fri,rango=periodo(hoy)
    mes,anio=fri.month,fri.year
    hoja=MESES[mes-1].upper()+f" {anio}"
    mes_label=f"{MESES[mes-1].capitalize()} {anio} (acumulado al {fri.day})"

    # ---------- FUENTE 1: HOJA DE REPORTES ----------
    wb1=openpyxl.load_workbook(find_xlsx("HOJA DE REPORTES","rep.xlsx"),data_only=True)
    ws=wb1[hoja]
    cruza_mes=sat.month!=fri.month
    if cruza_mes:
        import calendar
        hoja_prev=MESES[sat.month-1].upper()+f" {sat.year}"
        ws_prev=wb1[hoja_prev]
        c1_prev=25+sat.day                                        # col del sáb en pestaña anterior
        c2_prev=25+calendar.monthrange(sat.year,sat.month)[1]     # último día del mes anterior
        c1_curr=26                                                 # col Z = día 1 del mes del viernes
        c2_curr=25+fri.day
        def wk(r):
            s=sum(v for c in range(c1_prev,c2_prev+1) if isinstance(v:=ws_prev.cell(r,c).value,(int,float)))
            s+=sum(v for c in range(c1_curr,c2_curr+1) if isinstance(v:=ws.cell(r,c).value,(int,float)))
            return s
    else:
        c1,c2=25+sat.day,25+fri.day     # columnas del rango semanal (dia 1 = col Z = 26)
        wk=lambda r: sum(v for c in range(c1,c2+1) if isinstance(v:=ws.cell(r,c).value,(int,float)))
    # Ingresos: pestañas DATOS_ORIGEN_<MES> (fecha, asesora, referidos, redes, visitó, cobros, renovaciones, ampliaciones).
    # (Los bloques de ingresos de la pestaña del mes quedaron en 0 y las filas 196-201 se movieron.)
    nom={"MONICA":"Monica","LAURA":"Laura","DANNA":"Danna"}
    orden=["MONICA","LAURA","DANNA"]
    def _num(v):
        if isinstance(v,(int,float)): return float(v)
        t=str(v or "").replace("S/","").replace(" ","").strip()
        if t in ("","-"): return 0.0
        if "," in t: t=t.replace(".","").replace(",",".")
        try: return float(t)
        except: return 0.0
    def _fecha(v):
        if isinstance(v,datetime.datetime): return v.date()
        if isinstance(v,datetime.date): return v
        if isinstance(v,(int,float)) and v>40000: return datetime.date(1899,12,30)+datetime.timedelta(days=int(v))
        return None
    def _norm(v):
        import unicodedata
        return unicodedata.normalize("NFD",str(v or "")).encode("ascii","ignore").decode().strip().upper()
    ing={a:{"n":0.0,"f":0.0} for a in orden}
    mes_canal=[0.0]*6; mes_ase={a:0.0 for a in orden}
    for mm in sorted({sat.month,fri.month}):
        tab="DATOS_ORIGEN_"+MESES[mm-1].upper()
        if tab not in wb1.sheetnames: continue
        for row in wb1[tab].iter_rows(min_row=1,values_only=True):
            if len(row)<10: continue
            f=_fecha(row[2]); a=_norm(row[3])
            if not f or f.month!=mm or a not in ing: continue
            v=[_num(x) for x in row[4:10]]
            if sat<=f<=fri: ing[a]["n"]+=v[0]+v[1]+v[2]; ing[a]["f"]+=v[3]+v[4]+v[5]
            if f.month==mes and f.year==anio and f<=fri:
                mes_ase[a]+=sum(v)
                for i in range(6): mes_canal[i]+=v[i]
    nuevos=[round(ing[a]["n"],2) for a in orden]; fidel=[round(ing[a]["f"],2) for a in orden]
    g=lambda r,c: ws.cell(r,c).value or 0
    m_ref,m_red,m_vis,m_cob=mes_canal[0],mes_canal[1],mes_canal[2],mes_canal[3]; m_ren=mes_canal[4]+mes_canal[5]
    mes_nuevos=m_ref+m_red+m_vis; mes_fidel=m_cob+m_ren; mes_total=round(sum(mes_canal),2)
    meta=sum(METAS.values())
    fp_prog=wk(183); fp_asis=wk(184)
    _ret=g(192,58); ret=float(_ret) if isinstance(_ret,(int,float)) else 0
    _pla=g(188,58); planes=float(_pla) if isinstance(_pla,(int,float)) else 0
    kpi=lambda r,c: g(r,c)
    # semana: agendamiento + cierres desde bloques diarios
    AG={"DANNA":34,"MONICA":41,"LAURA":48}
    CI={"LAURA":(67,69),"DANNA":(74,76),"MONICA":(81,83)}
    s_apc=sum(wk(AG[a]) for a in AG); s_apv=sum(wk(AG[a]+1) for a in AG); s_apl=sum(wk(AG[a]+2) for a in AG)
    s_pres=sum(wk(CI[a][0]) for a in CI); s_close=sum(wk(CI[a][1]) for a in CI)
    nutri_wk=(wk(165),wk(166))
    mk=lambda r: sum(v for c in range(26,57) if isinstance(v:=ws.cell(r,c).value,(int,float)))
    mes_present=sum(mk(CI[a][0]) for a in CI); mes_close=sum(mk(CI[a][1]) for a in CI)
    cierre_asesora={a:{"pres":int(wk(CI[a][0])),"cerro":int(wk(CI[a][1])),"pres_m":int(mk(CI[a][0])),"cerro_m":int(mk(CI[a][1]))} for a in CI}
    EFA_R={"DANNA":{"APC":(256,257),"APV":(258,259),"APL":(260,261)},
           "LAURA":{"APC":(265,266),"APV":(267,268),"APL":(269,270)},
           "MONICA":{"APC":(274,275),"APV":(276,277),"APL":(278,279)},
           }
    efect={}
    for ea,cc in EFA_R.items():
        efect[ea]={}
        for ch,(ra,rc) in cc.items():
            efect[ea][ch]={"a":int(wk(ra)),"c":int(wk(rc)),"a_m":int(mk(ra)),"c_m":int(mk(rc))}
    gest={}
    for ea,br in AG.items():
        gest[ea]={"APC":int(wk(br)),"APV":int(wk(br+1)),"APL":int(wk(br+2)),"APF":int(wk(br+3)),
                  "APC_m":int(mk(br)),"APV_m":int(mk(br+1)),"APL_m":int(mk(br+2)),"APF_m":int(mk(br+3))}
    nutri_m=(mk(165),mk(166))
    rank=[]
    for a in orden:
        ta=sum(efect[a][ch]["a"] for ch in ["APC","APV","APL"])
        tc=sum(efect[a][ch]["c"] for ch in ["APC","APV","APL"])
        rank.append([nom[a],ta,tc,round(tc/ta*100,1) if ta else 0])
    rank_v=sorted(rank,key=lambda x:-x[1])
    rank_c=sorted(rank,key=lambda x:-x[3])

    # ---------- FUENTE 2: PIPEDRIVE DIRECTO (canal + horarios) ----------
    PD_TOKEN=_cred("PIPEDRIVE")
    if not PD_TOKEN: raise SystemExit("Falta el token de PIPEDRIVE en credenciales_api.txt")
    PD_BASE="https://api.pipedrive.com/v1"
    PD_PP_KEY="7de502a12cd072ed8904fc783228913fa16a0e29"   # campo pipeline/asesora en persona
    PD_CL_KEY="33b8be2e235bd672060ee054b04372be13b53f52"   # campo cierre en persona
    PD_CIERRE_SI="136"
    PD_PP_MAP={"131":"MONICA","183":"LAURA","243":"DANNA"}
    PD_COACH_KEY="9e850eece75b5e1d9ed9b4e61e8643a57e1d4b70"   # campo COACH FP en persona
    PD_COACH_MAP={"150":"JOSUE","151":"JOSE","152":"JHONATHAN","153":"LEO","154":"JOAQUIN","155":"PAUL","156":"JHORSSON","157":"BRANDON","166":"SEBASTIAN","178":"BRAYAN","179":"GABRIEL","215":"VICTOR","242":"MIRKO","260":"LENNIE","271":"SIN COACH FP"}

    # 2a. Traer actividades FREE PASS (cubre mes del viernes + días del mes anterior si cruza)
    d_ini_date=min(sat,datetime.date(anio,mes,1))-datetime.timedelta(days=1)
    d_ini=d_ini_date.isoformat()
    d_fin=(datetime.date(anio+(1 if mes==12 else 0),(mes%12)+1,1)+datetime.timedelta(days=1)).isoformat()
    fp_acts=[]; start_p=0
    for _ in range(30):
        r=requests.get(f"{PD_BASE}/activities",params={"type":"meeting","start_date":d_ini,"end_date":d_fin,"start":start_p,"limit":500,"api_token":PD_TOKEN})
        if r.status_code!=200: break
        j=r.json(); fp_acts.extend(j.get("data") or [])
        pag=j.get("additional_data",{}).get("pagination",{})
        if not pag.get("more_items_in_collection"): break
        start_p=pag.get("next_start",start_p+500)
    print(f"  Pipedrive: {len(fp_acts)} actividades FREE PASS")

    # 2b. Convertir a hora Lima y filtrar (mes del viernes + días de semana que caigan en mes anterior)
    mes1=datetime.date(anio,mes,1)  # 1ro del mes del viernes
    def to_lima(act):
        dd=act.get("due_date"); tt=act.get("due_time") or "00:00"
        if not dd: return None
        try:
            utc=datetime.datetime.fromisoformat(f"{dd}T{tt}:00")-datetime.timedelta(hours=5)
            d=utc.date()
            # Incluir si cae en el mes del viernes O si cae en la semana (para cruce de mes)
            if (d.month==mes and d.year==anio) or (sat<=d<=fri): return utc
        except: pass
        return None

    acts_lima=[]
    for a in fp_acts:
        lima=to_lima(a)
        if lima:
            a["_lima"]=lima; acts_lima.append(a)

    # 2c. Agrupar por persona
    by_person=defaultdict(list)
    for a in acts_lima:
        pid=a.get("person_id")
        if isinstance(pid,dict): pid=pid.get("value")
        if pid: by_person[str(pid)].append(a)

    # 2d. Fetch datos de persona (cierre + asesora) en lotes
    person_data={}
    pids=list(by_person.keys())
    for i in range(0,len(pids),50):
        batch=pids[i:i+50]
        for pid in batch:
            try:
                r=requests.get(f"{PD_BASE}/persons/{pid}",params={"api_token":PD_TOKEN})
                if r.status_code==200:
                    pd_=r.json().get("data",{})
                    person_data[pid]={"pp":pd_.get(PD_PP_KEY),"cl":pd_.get(PD_CL_KEY),"coach":pd_.get(PD_COACH_KEY)}
                else:
                    person_data[pid]={"pp":None,"cl":None,"coach":None}
            except:
                person_data[pid]={"pp":None,"cl":None,"coach":None}

    # 2e. Calcular canal, horarios
    def rep_act(lst):
        done=[a for a in lst if a.get("done")]
        src=done if done else lst
        return max(src,key=lambda a:a["_lima"])

    def chan(subj):
        s=(subj or "").upper()
        if "APC" in s: return "APC"
        if "APV" in s: return "APV"
        if "APL" in s: return "APL"
        return None

    def in_week(lima):
        d=lima.date()
        return sat<=d<=fri

    canal={"APC":{"ag":0,"pa":0,"ins":0},"APV":{"ag":0,"pa":0,"ins":0},"APL":{"ag":0,"pa":0,"ins":0}}
    H=16  # horas 6-21
    hM_p=[0]*H; hM_i=[0]*H; hM_cr={a:[0]*H for a in ASE}
    hS_p=[0]*H; hS_i=[0]*H; hS_cr={a:[0]*H for a in ASE}

    for pid in by_person:
        r_=rep_act(by_person[pid])
        c=chan(r_.get("subject"))
        pd_=person_data.get(pid,{"pp":None,"cl":None})
        es_inscrito=str(pd_["cl"])==PD_CIERRE_SI
        asesora_=PD_PP_MAP.get(str(pd_["pp"]))
        lima=r_["_lima"]; hi=lima.hour-6

        es_del_mes=lima.month==mes and lima.year==anio
        if c and c in canal and es_del_mes:
            canal[c]["ag"]+=1
            if r_.get("done"): canal[c]["pa"]+=1
            if es_inscrito: canal[c]["ins"]+=1
        if 0<=hi<H:
            if es_del_mes:
                if pd_["pp"] is not None and pd_["pp"]!="":
                    hM_p[hi]+=1
                    if asesora_ and asesora_ in hM_cr: hM_cr[asesora_][hi]+=1
                if es_inscrito: hM_i[hi]+=1
            if in_week(lima):
                if pd_["pp"] is not None and pd_["pp"]!="":
                    hS_p[hi]+=1
                    if asesora_ and asesora_ in hS_cr: hS_cr[asesora_][hi]+=1
                if es_inscrito: hS_i[hi]+=1

    # Armar resultados
    L=["Chat (APC)","Visita (APV)","Llamada (APL)"]
    CH_MAP={"Chat (APC)":"APC","Visita (APV)":"APV","Llamada (APL)":"APL"}
    ag=[canal[CH_MAP[x]]["ag"] for x in L]
    pa=[canal[CH_MAP[x]]["pa"] for x in L]
    ins_c=[canal[CH_MAP[x]]["ins"] for x in L]
    notas=[]
    for i,x in enumerate(L):
        pct=round(pa[i]/ag[i]*100) if ag[i] else 0
        if i==0: notas.append(f"mejor canal ({pct}% asiste)")
        elif ag[i] and pa[i]<=1: notas.append("trae volumen, casi nadie asiste")
        else: notas.append("")
    canal_result={"labels":L,"agendaron":ag,"pasaron":pa,"inscritos":ins_c,
                  "total":[sum(ag),sum(pa),sum(ins_c)],"notas":notas,
                  "pie":"Conteo por persona en Pipedrive (canal segun el Free Pass)."}
    sem_ins=int(s_close)   # cierres semanales de bloques diarios de la hoja
    HOURS=list(range(6,22)); HL=[f"{h:02d}-{h+1:02d}" for h in HOURS]
    horas_mes={"pasaron":hM_p,"inscritos":hM_i,"cross":{a:v for a,v in hM_cr.items() if sum(v)>0}}
    horas_sem={"pasaron":hS_p,"inscritos":hS_i,"cross":{a:v for a,v in hS_cr.items() if sum(v)>0}}

    # ---------- CALIDAD DE DATOS PIPEDRIVE ----------
    import re
    VALID_ASE_PD={"MONICA","LAURA","DANNA"}
    VALID_CANAL_PD={"APC","APV","APL"}
    calidad={"ok":[],"otros_asesores":[],"formato_viejo":[],"otros":[]}
    acts_mes=[a for a in acts_lima if a["_lima"].month==mes and a["_lima"].year==anio]
    for a in acts_mes:
        subj=(a.get("subject") or "").strip().upper()
        parts=subj.split()
        if len(parts)==3 and parts[0]=="FP" and parts[2] in VALID_CANAL_PD:
            if parts[1] in VALID_ASE_PD:
                calidad["ok"].append(subj)
            else:
                calidad["otros_asesores"].append({"subject":a.get("subject","").strip(),"asesora":parts[1],"canal":parts[2],"fecha":a["_lima"].strftime("%d/%m")})
        elif "FP" in subj or "FREE" in subj:
            calidad["formato_viejo"].append({"subject":a.get("subject","").strip(),"fecha":a["_lima"].strftime("%d/%m")})
        else:
            calidad["otros"].append({"subject":a.get("subject","").strip(),"fecha":a["_lima"].strftime("%d/%m")})
    calidad_resumen={"total":len(acts_mes),"ok":len(calidad["ok"]),
        "otros_asesores":calidad["otros_asesores"],"formato_viejo":calidad["formato_viejo"],
        "otros":calidad["otros"]}
    print(f"  Calidad datos: {len(calidad['ok'])} ok, {len(calidad['otros_asesores'])} otros asesores, {len(calidad['formato_viejo'])} formato viejo, {len(calidad['otros'])} otros")

    # ---------- COACH KPI: tasa de cierre por coach FP ----------
    # Solo contar personas con al menos 1 actividad DONE (pasaron la clase) del mes
    by_person_mes={}
    for pid,alist in by_person.items():
        mes_acts=[a for a in alist if a["_lima"].month==mes and a["_lima"].year==anio]
        if mes_acts: by_person_mes[pid]=mes_acts
    coach_stats=defaultdict(lambda:{"fp":0,"cierres":0})
    for pid in by_person_mes:
        has_done=any(a.get("done") for a in by_person_mes[pid])
        if not has_done: continue  # actividad pendiente, no cuenta
        pd_c=person_data.get(pid,{"pp":None,"cl":None,"coach":None})
        coach_raw=str(pd_c.get("coach") or "")
        coach_name=PD_COACH_MAP.get(coach_raw,"SIN COACH FP")
        coach_stats[coach_name]["fp"]+=1
        if str(pd_c["cl"])==PD_CIERRE_SI:
            coach_stats[coach_name]["cierres"]+=1
    # Coach KPI: Score = cierres × %cierre (premia volumen + eficiencia)
    sin_coach=coach_stats.pop("SIN COACH FP",None)
    coach_kpi=[]
    for coach,st in coach_stats.items():
        pct=round(st["cierres"]/st["fp"]*100) if st["fp"] else 0
        score=round(st["cierres"]*(pct/100),1)
        coach_kpi.append({"coach":coach,"fp":st["fp"],"cierres":st["cierres"],"pct":pct,"score":score})
    coach_kpi.sort(key=lambda x:x["score"],reverse=True)
    if sin_coach:
        pct_sc=round(sin_coach["cierres"]/sin_coach["fp"]*100) if sin_coach["fp"] else 0
        score_sc=round(sin_coach["cierres"]*(pct_sc/100),1)
        coach_kpi.append({"coach":"SIN COACH FP","fp":sin_coach["fp"],"cierres":sin_coach["cierres"],"pct":pct_sc,"score":score_sc})
    t_fp=sum(s["fp"] for s in coach_kpi); t_ci=sum(s["cierres"] for s in coach_kpi)
    t_pct=round(t_ci/t_fp*100) if t_fp else 0
    coach_kpi.append({"coach":"TOTAL","fp":t_fp,"cierres":t_ci,"pct":t_pct,"score":round(t_ci*(t_pct/100),1)})
    print(f"  Coach KPI: {len(coach_kpi)-1} items, {t_fp} FP, {t_ci} cierres")

    # ---------- FUENTE 3: BASE DIARIA (vencidos + proximos a renovar) ----------
    wb2=openpyxl.load_workbook(find_xlsx("ACTUALIZAR BASE DIARIA","base.xlsx"),data_only=True)
    b=wb2[wb2.sheetnames[0]]
    def asesora(v):
        v=(v or "").lower()
        for k,n in [("laura","LAURA"),("monica","MÓNICA"),("danna","DANNA"),("dilan","DANNA"),("liam","DANNA"),("valeria","VALERIA")]:
            if k in v: return n
        return (v.upper() or "SIN ASESORA")
    def limpia(n):
        w=(n or "").replace(", "," ").strip().title().split(); o=[]
        for x in w:
            if not o or o[-1].lower()!=x.lower(): o.append(x)
        h=len(o)//2
        if len(o)%2==0 and [x.lower() for x in o[:h]]==[x.lower() for x in o[h:]]: o=o[:h]
        return " ".join(o)
    def parse_ua(v):
        """Parsea última asistencia: datetime nativo o string español '02/10/2026 06:03 p. m.'"""
        if isinstance(v,datetime.datetime): return v
        if not isinstance(v,str) or not v.strip(): return None
        try:
            parts=v.strip().split()
            d,m,y=parts[0].split('/'); h,mi=parts[1].split(':')
            h=int(h); ampm=parts[2] if len(parts)>2 else ''
            if 'p' in ampm.lower() and h<12: h+=12
            elif 'a' in ampm.lower() and h==12: h=0
            return datetime.datetime(int(y),int(m),int(d),h,int(mi))
        except: return None

    venc=defaultdict(list); best={}
    for r in range(3,b.max_row+1):
        ff=b.cell(r,10).value
        if not isinstance(ff,datetime.datetime): continue
        cod=b.cell(r,1).value
        if cod not in best or ff>best[cod][0]: best[cod]=(ff,r)
        if sat<=ff.date()<=fri:
            ua_dt=parse_ua(b.cell(r,11).value)
            dult=(hoy-ua_dt.date()).days if ua_dt else -1
            venc[asesora(b.cell(r,13).value)].append(
                [limpia(b.cell(r,2).value),ff.strftime("%d/%m"),(b.cell(r,8).value or "").title(),int(b.cell(r,12).value or 0),dult])
    reno=defaultdict(list)
    for cod,(ff,r) in best.items():
        dias=(ff.date()-hoy).days
        if 10<=dias<=30:
            ua_dt=parse_ua(b.cell(r,11).value)
            dult=(hoy-ua_dt.date()).days if ua_dt else -1
            reno[asesora(b.cell(r,13).value)].append(
                [limpia(b.cell(r,2).value),ff.strftime("%d/%m"),(b.cell(r,8).value or "").title(),int(b.cell(r,12).value or 0),dias,dult])

    # ---------- FUENTE 4: APPS FIT (retención de uso) ----------
    AF_AUTH="https://webapiappsfit-cliente.azurewebsites.net/api/managements/auth"
    AF_CUST="https://webapiappsfit-cliente.azurewebsites.net/api/managements/customers"
    try:
        if not _cred("APPS ?FIT"): raise Exception("Falta APPS FIT / Token: en credenciales_api.txt")
        af_tok=requests.post(AF_AUTH,json={"TokenEmpresa":_cred("APPS ?FIT") or ""},timeout=30).json()["Item"]["Token"]
        af_h={"Authorization":f"Bearer {af_tok}"}
        af_all=[]; af_pg=1; af_tp=1
        while af_pg<=af_tp:
            af_r=requests.get(f"{AF_CUST}?page={af_pg}&date_from=2020-01-01&date_to=2099-12-31&type_date=2&with_frostbite=0",headers=af_h,timeout=60).json()["Item"]
            af_all.extend(af_r.get("cutomers") or af_r.get("customers") or [])
            af_tp=af_r.get("paging",{}).get("pages",1); af_pg+=1
        # dedup
        af_best={}
        for c in af_all:
            cod=c.get("CodigoSocio")
            if not cod: continue
            ff_s=c.get("FechaFin","")
            try: ff_dt=datetime.datetime.fromisoformat(ff_s.replace("Z","")) if ff_s else datetime.datetime.min
            except: ff_dt=datetime.datetime.min
            if cod not in af_best or ff_dt>af_best[cod]["_ff"]:
                c["_ff"]=ff_dt; af_best[cod]=c
        af_socios=list(af_best.values())
        # clasificar
        def af_ase(v):
            v=(v or "").strip().lower()
            if not v or v=="sin vendedor": return "Sin asesora"
            if v.startswith("laura"): return "Laura"
            if v.startswith("monica") or v.startswith("mónica"): return "Mónica"
            if v.startswith("danna"): return "Danna"
            if v.startswith("valeria"): return "Valeria (ex)"
            return v.title()
        af_ini=hoy-datetime.timedelta(days=7); af_fin=hoy
        af_stats=defaultdict(lambda:{"activos":0,"vinieron":0,"no_vinieron":[]})
        for s in af_socios:
            if s["_ff"].date()<hoy: continue
            ase_n=af_ase(s.get("Vendedor"))
            af_stats[ase_n]["activos"]+=1
            ua_s=s.get("UltimaAsistencia",""); ua_d=None
            if ua_s:
                try: ua_d=datetime.datetime.fromisoformat(ua_s.replace("Z","")).date()
                except: pass
            if ua_d and af_ini<=ua_d<=af_fin:
                af_stats[ase_n]["vinieron"]+=1
            else:
                nombre=f"{s.get('Nombres','')} {s.get('Apellidos','')}".strip().title()
                dias_sv=(hoy-ua_d).days if ua_d else -1
                af_stats[ase_n]["no_vinieron"].append([nombre,dias_sv,s.get("Celular","")])
        af_orden=[a for a in ["Mónica","Laura","Danna"] if a in af_stats]+sorted([a for a in af_stats if a not in ["Mónica","Laura","Danna"]])
        af_total_a=sum(af_stats[a]["activos"] for a in af_stats)
        af_total_v=sum(af_stats[a]["vinieron"] for a in af_stats)
        af_pct_g=round(af_total_v/af_total_a*100) if af_total_a else 0
        retencion_uso={"periodo":f"{af_ini.isoformat()} a {af_fin.isoformat()}","meta":85,
            "global":{"activos":af_total_a,"vinieron":af_total_v,"pct":af_pct_g},
            "asesoras":[]}
        for a in af_orden:
            d=af_stats[a]; pct_a=round(d["vinieron"]/d["activos"]*100) if d["activos"] else 0
            top_no=sorted(d["no_vinieron"],key=lambda x:x[1],reverse=True)[:5]
            retencion_uso["asesoras"].append({"nombre":a,"activos":d["activos"],"vinieron":d["vinieron"],"pct":pct_a,
                "no_vinieron":[{"nombre":n,"dias":ds,"celular":c} for n,ds,c in top_no]})
        print(f"  Apps Fit: {len(af_socios)} socios, {af_total_a} activos, retención {af_pct_g}%")
    except Exception as e:
        print(f"  Apps Fit ERROR: {e}")
        retencion_uso=None

    # ---------- ARMAR data.json ----------
    tot_n=round(sum(nuevos),2); tot_f=round(sum(fidel),2); tot=round(tot_n+tot_f,2)
    pct_meta=round(mes_total/meta*100) if meta else 0
    pa=round(fp_asis/fp_prog*100) if fp_prog else 0
    pi=round(sem_ins/fp_asis*100) if fp_asis else 0
    pt=round(sem_ins/fp_prog*100) if fp_prog else 0
    top=max(zip(orden,[nuevos[i]+fidel[i] for i in range(len(orden))]),key=lambda x:x[1])
    ceros=[nom[a] for i,a in enumerate(orden) if nuevos[i]+fidel[i]==0]
    D={
      "rango":rango,"mes_label":mes_label,
      "kpis":[[f"S/ {round(tot):,}","Ingreso de la semana",f"{pct_meta}% de la meta mensual"],
              [f"{int(fp_asis)} / {int(fp_prog)}","Pasaron su clase gratis",f"Asistencia {pa}%"],
              [f"{sem_ins}","Se inscribieron",f"{pi}% de los que asistieron"],
              [f"{round(ret*100)}%","Retencion del mes",f"{round(planes)} planes activos"]],
      "resumen_nota":f"Top de la semana: {nom[top[0]]} (S/ {round(top[1]):,}). Sin ventas: {', '.join(ceros) if ceros else 'ninguna'}. Revisar que el registro del mes en la hoja este completo.",
      "ing":{"asesores":[nom[a] for a in orden],"nuevos":nuevos,"fidel":fidel,"tot_nuevos":tot_n,"tot_fidel":tot_f,"total":tot},
      "embudo":{"fp":int(fp_prog),"pasaron":int(fp_asis),"inscritos":sem_ins,"pct_asis":pa,"pct_insc":pi,"pct_total":pt},
      "mes":{"nuevos":mes_nuevos,"fidel":mes_fidel,"total":mes_total,
             "desglose":[["REFER",m_ref],["REDES",m_red],["VISITA",m_vis],["COBRO",m_cob],["REN-AMP",m_ren]]},
      "canal":canal_result,
      "efect_asesora":efect,
      "gestion":gest,
      "cierre_asesora":cierre_asesora,
      "nutricion_det":{"a_s":int(nutri_wk[0]),"r_s":int(nutri_wk[1]),"a_m":int(nutri_m[0]),"r_m":int(nutri_m[1])},
      "coach_kpi":coach_kpi,
      "ranking":{"vol":rank_v,"conv":rank_c},
      "mejoro":[f"{nom[top[0]]} lidera la venta de la semana (S/ {round(top[1]):,}).",
                f"Asistencia a Free Pass: {pa}% ({int(fp_asis)} de {int(fp_prog)}).",
                f"Nutricion: {int(nutri_wk[1])} de {int(nutri_wk[0])} citas asistieron.",
                f"Agendamiento por chat: {int(s_apc)} APC en la semana."],
      "pendiente":([f"Sin produccion esta semana: {', '.join(ceros)}."] if ceros else [])+
                  [f"Inscripcion del mes {round(mes_close/mes_present*100) if mes_present else 0}% - meta 70%.",
                   f"Ingreso del mes S/ {round(mes_total):,} vs meta S/ {round(meta):,}." if meta else "Meta mensual no fijada en la hoja.",
                   f"Free Pass que no asisten: {int(fp_prog-fp_asis)} de {int(fp_prog)} programados."],
      "vencidos":dict(venc) or {"SIN DATOS":[]},
      "renovar":dict(reno) or {"SIN DATOS":[]},
      "calidad_datos":calidad_resumen,
      "retencion_uso":retencion_uso,
      "horas":{"labels":HL,"mes":horas_mes,"sem":horas_sem},
      "recos":[["Doble pico horario","Concentrar Free Pass y demos en las horas donde realmente se pasa la clase y se cierra (ver laminas de horarios)."],
               ["Renovaciones de la semana",f"{sum(len(v) for v in venc.values())} socios terminaron plan y {sum(len(v) for v in reno.values())} vencen en 30-10 dias. Contactar primero a los de baja asistencia."],
               ["Activar a quien no vende",f"{', '.join(ceros)} sin produccion. Reasignar leads o revisar carga." if ceros else "Sostener el ritmo de agendamiento por chat."],
               ["Subir la inscripcion","El chat es el unico canal que convierte; la llamada trae volumen pero casi nadie asiste."]],
    }
    json.dump(D,open("data.json","w"),ensure_ascii=False,indent=1)
    print(f"OK data.json | semana {rango} | ingreso {tot} | FP {int(fp_prog)}>{int(fp_asis)}>{sem_ins} | vencidos {sum(len(v) for v in venc.values())} | renovar {sum(len(v) for v in reno.values())}")

if __name__=="__main__": main()
