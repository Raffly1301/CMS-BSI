import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    StockOpnameItem,
    StockOpnameRecord,
    ItemMaster,
    User,
    InflowSource
} from '../types';
import { INFLOW_SOURCES } from '../constants';
import {
    saveAndApplyStockOpname,
    fetchStockOpnames,
    deleteStockOpname
} from '../lib/stockOpnameService';
import { supabase } from '../lib/supabase';
import { formatNumber } from '@/utils';
import {
    ClipboardCheck,
    Plus,
    Trash2,
    Copy,
    FileSpreadsheet,
    Upload,
    Download,
    Save,
    CheckCircle2,
    AlertTriangle,
    RotateCcw,
    Calendar,
    Layers,
    Search,
    History,
    Eye,
    Info,
    ChevronDown,
    ChevronUp,
    Database,
    ArrowRight
} from 'lucide-react';

interface StockOpnameTabProps {
    user?: User | null;
    itemsList: ItemMaster[];
    onOpnameApplied?: (opnameDate: string) => void;
}

declare const XLSX: any;

const defaultSources: InflowSource[] = INFLOW_SOURCES;

export const StockOpnameTab: React.FC<StockOpnameTabProps> = ({
    user,
    itemsList,
    onOpnameApplied
}) => {
    const isViewer = user?.role?.toUpperCase() === 'VIEWER';
    const isSuperAdmin = user?.role?.toUpperCase() === 'SUPERADMIN' || user?.username?.toLowerCase() === 'superadmin';

    const [opnameDate, setOpnameDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    );
    const [syncChiller, setSyncChiller] = useState<boolean>(true);
    const [rows, setRows] = useState<StockOpnameItem[]>([]);
    const [history, setHistory] = useState<StockOpnameRecord[]>([]);
    const [selectedHistory, setSelectedHistory] = useState<StockOpnameRecord | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [showSqlGuide, setShowSqlGuide] = useState<boolean>(false);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [copiedSql, setCopiedSql] = useState<boolean>(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load history on mount
    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        setIsLoading(true);
        try {
            const res = await fetchStockOpnames();
            setHistory(res.records);
        } catch (e) {
            console.error('Error loading history:', e);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to create empty row
    const createEmptyRow = (defaultItem?: ItemMaster): StockOpnameItem => {
        const it = defaultItem || (itemsList.length > 0 ? itemsList[0] : null);
        return {
            id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            itemsId: it?.id || '',
            itemCode: it?.code || '',
            itemName: it?.description || '',
            productionDate: opnameDate,
            slaughteringDate: opnameDate,
            source: 'PDS',
            allocation: 'PDS',
            pcs: 0,
            kgs: 0,
            isWIP: false
        };
    };

    // Initialize with 1 empty row if empty
    useEffect(() => {
        if (rows.length === 0 && itemsList.length > 0) {
            setRows([createEmptyRow()]);
        }
    }, [itemsList]);

    // Totals
    const { totalPcs, totalKgs, totalRows } = useMemo(() => {
        let p = 0;
        let k = 0;
        rows.forEach(r => {
            p += Number(r.pcs) || 0;
            k += Number(r.kgs) || 0;
        });
        return {
            totalPcs: p,
            totalKgs: k,
            totalRows: rows.length
        };
    }, [rows]);

    // Row operations
    const handleAddRow = () => {
        setRows(prev => [...prev, createEmptyRow()]);
    };

    const handleDuplicateRow = (index: number) => {
        const target = rows[index];
        if (!target) return;
        const duplicated: StockOpnameItem = {
            ...target,
            id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
        };
        setRows(prev => {
            const next = [...prev];
            next.splice(index + 1, 0, duplicated);
            return next;
        });
    };

    const handleRemoveRow = (index: number) => {
        setRows(prev => {
            const next = prev.filter((_, i) => i !== index);
            return next.length > 0 ? next : [createEmptyRow()];
        });
    };

    const handleRowChange = (index: number, field: keyof StockOpnameItem, value: any) => {
        setRows(prev => prev.map((row, i) => {
            if (i !== index) return row;
            if (field === 'itemsId') {
                const selected = itemsList.find(it => it.id === value);
                return {
                    ...row,
                    itemsId: value,
                    itemCode: selected?.code || 'N/A',
                    itemName: selected?.description || 'N/A'
                };
            }
            return { ...row, [field]: value };
        }));
    };

    const handleClearAll = () => {
        if (window.confirm('Bersihkan semua baris input Stock Opname ini?')) {
            setRows([createEmptyRow()]);
            setSaveStatus(null);
        }
    };

    // Download Excel Template
    const handleDownloadTemplate = () => {
        try {
            if (typeof XLSX === 'undefined') {
                alert('Library Excel belum siap. Silakan muat ulang halaman.');
                return;
            }

            // Sample template data
            const sampleData = [
                {
                    'Kode Item': itemsList[0]?.code || 'BL-01',
                    'Nama Item': itemsList[0]?.description || 'Boneless Dada',
                    'Tanggal Produksi (YYYY-MM-DD)': opnameDate,
                    'Tanggal Potong (YYYY-MM-DD)': opnameDate,
                    'Sumber': 'PDS',
                    'Alokasi': 'PDS',
                    'Pcs': 100,
                    'Kg': 150.5,
                    'WIP (YA/TIDAK)': 'TIDAK'
                },
                {
                    'Kode Item': itemsList[1]?.code || 'PT-01',
                    'Nama Item': itemsList[1]?.description || 'Parting 8',
                    'Tanggal Produksi (YYYY-MM-DD)': opnameDate,
                    'Tanggal Potong (YYYY-MM-DD)': opnameDate,
                    'Sumber': 'FPS',
                    'Alokasi': 'FPS',
                    'Pcs': 80,
                    'Kg': 120.0,
                    'WIP (YA/TIDAK)': 'YA'
                }
            ];

            const ws = XLSX.utils.json_to_sheet(sampleData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Template Stock Opname');

            // Also add reference sheet for items
            const refItems = itemsList.map(it => ({
                'Kode': it.code,
                'Deskripsi / Nama Item': it.description
            }));
            const wsRef = XLSX.utils.json_to_sheet(refItems);
            XLSX.utils.book_append_sheet(wb, wsRef, 'Daftar Kode Item');

            // Reference sheet for Sources
            const refSources = defaultSources.map(s => ({ 'Sumber / Alokasi': s }));
            const wsSources = XLSX.utils.json_to_sheet(refSources);
            XLSX.utils.book_append_sheet(wb, wsSources, 'Daftar Sumber');

            XLSX.writeFile(wb, `Template_Stock_Opname_${opnameDate}.xlsx`);
        } catch (err: any) {
            console.error('Download template error:', err);
            alert(`Gagal membuat template Excel: ${err.message || err}`);
        }
    };

    // Import from Excel
    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (typeof XLSX === 'undefined') {
            alert('Library Excel belum siap. Silakan muat ulang halaman.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = evt.target?.result;
                const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                if (!json || json.length === 0) {
                    alert('File Excel kosong atau format tidak sesuai.');
                    return;
                }

                const importedRows: StockOpnameItem[] = [];
                let unmatchedCodes: string[] = [];

                json.forEach((row, idx) => {
                    // Normalize column headers
                    const codeVal = String(row['Kode Item'] || row['Kode'] || row['Item Code'] || row['code'] || '').trim();
                    const nameVal = String(row['Nama Item'] || row['Deskripsi'] || row['Item Name'] || '').trim();
                    const pdVal = String(row['Tanggal Produksi (YYYY-MM-DD)'] || row['Tanggal Produksi'] || row['PD'] || opnameDate).trim();
                    const sdVal = String(row['Tanggal Potong (YYYY-MM-DD)'] || row['Tanggal Potong'] || row['SD'] || opnameDate).trim();
                    const srcVal = String(row['Sumber'] || row['Source'] || 'PDS').trim().toUpperCase() as InflowSource;
                    const alocVal = String(row['Alokasi'] || row['Allocation'] || 'PDS').trim().toUpperCase() as InflowSource;
                    const pcsVal = Number(row['Pcs'] || row['Quantity Pcs'] || row['PCS'] || 0);
                    const kgsVal = Number(row['Kg'] || row['Kgs'] || row['Quantity Kgs'] || row['KG'] || 0);
                    const wipRaw = String(row['WIP (YA/TIDAK)'] || row['WIP'] || row['Status WIP'] || '').trim().toUpperCase();
                    const isWIP = wipRaw === 'YA' || wipRaw === 'TRUE' || wipRaw === '1' || wipRaw === 'YES';

                    // Try match item with itemsList
                    let matched = itemsList.find(it => it.code.trim().toUpperCase() === codeVal.toUpperCase());
                    if (!matched && nameVal) {
                        matched = itemsList.find(it => it.description.trim().toUpperCase() === nameVal.toUpperCase());
                    }

                    if (!matched && codeVal) {
                        unmatchedCodes.push(codeVal);
                    }

                    importedRows.push({
                        id: `row-import-${Date.now()}-${idx}`,
                        itemsId: matched?.id || (itemsList[0]?.id || ''),
                        itemCode: matched?.code || codeVal || 'N/A',
                        itemName: matched?.description || nameVal || 'Item Tidak Terdaftar',
                        productionDate: pdVal || opnameDate,
                        slaughteringDate: sdVal || opnameDate,
                        source: defaultSources.includes(srcVal) ? srcVal : 'PDS',
                        allocation: defaultSources.includes(alocVal) ? alocVal : 'PDS',
                        pcs: pcsVal,
                        kgs: kgsVal,
                        isWIP
                    });
                });

                if (importedRows.length > 0) {
                    setRows(importedRows);
                    let msg = `Berhasil mengimpor ${importedRows.length} baris dari Excel.`;
                    if (unmatchedCodes.length > 0) {
                        msg += ` Perhatian: ${unmatchedCodes.length} kode item tidak ditemukan di master (${unmatchedCodes.slice(0, 3).join(', ')}...).`;
                    }
                    setSaveStatus({ type: 'success', message: msg });
                }
            } catch (err: any) {
                console.error('Import error:', err);
                alert(`Gagal membaca file Excel: ${err.message || err}`);
            } finally {
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };
        reader.readAsBinaryString(file);
    };

    // Submit / Apply Stock Opname
    const handleApplyOpname = async () => {
        if (isViewer) {
            alert('Akun Viewer hanya memiliki akses baca dan tidak dapat menerapkan Stock Opname.');
            return;
        }

        if (rows.length === 0) {
            alert('Harap masukkan minimal 1 baris item untuk Stock Opname.');
            return;
        }

        // Validation
        const invalidRows = rows.filter(r => !r.itemsId || (Number(r.pcs) <= 0 && Number(r.kgs) <= 0));
        if (invalidRows.length > 0 && rows.length === invalidRows.length) {
            alert('Mohon lengkapi kode item serta kuantitas (Pcs atau Kg) untuk baris Stock Opname.');
            return;
        }

        const confirmMsg =
            `Konfirmasi Stock Opname tanggal ${opnameDate}?\n\n` +
            `• Total Baris: ${rows.length}\n` +
            `• Total Pcs: ${formatNumber(totalPcs)}\n` +
            `• Total Kg: ${formatNumber(totalKgs, 2)} kg\n` +
            `• Sinkronisasi Chiller: ${syncChiller ? 'YA (Stok fisik aktif di Chiller akan diselaraskan)' : 'TIDAK'}\n\n` +
            `Hasil opname ini akan langsung menjadi Stok Awal (Opening Stock) pada Laporan Stok Harian tanggal ${opnameDate}.`;

        if (!window.confirm(confirmMsg)) return;

        setIsSaving(true);
        setSaveStatus(null);

        try {
            const res = await saveAndApplyStockOpname({
                opnameDate,
                items: rows,
                user: user || { id: 'user-0', username: 'admin', fullName: 'Admin', role: 'ADMIN' },
                syncChillerStock: syncChiller
            });

            setSaveStatus({
                type: 'success',
                message: res.message
            });

            await loadHistory();

            if (onOpnameApplied) {
                onOpnameApplied(opnameDate);
            }
        } catch (err: any) {
            console.error('Apply opname error:', err);
            setSaveStatus({
                type: 'error',
                message: `Gagal menerapkan Stock Opname: ${err.message || err}`
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Load past record into active editor
    const handleLoadPastRecord = (record: StockOpnameRecord) => {
        if (window.confirm(`Muat data Stock Opname tanggal ${record.opnameDate} ke dalam editor? Baris yang belum disimpan saat ini akan diganti.`)) {
            setOpnameDate(record.opnameDate);
            setRows(record.items.map((it, idx) => ({
                ...it,
                id: `row-past-${Date.now()}-${idx}`
            })));
            setSelectedHistory(null);
            setSaveStatus({
                type: 'success',
                message: `Data Stock Opname tanggal ${record.opnameDate} (${record.items.length} item) berhasil dimuat ke editor.`
            });
        }
    };

    // Delete past record
    const handleDeletePastRecord = async (recDate: string) => {
        if (!window.confirm(`Hapus riwayat Stock Opname tanggal ${recDate}?`)) return;

        try {
            await deleteStockOpname(recDate);
            await loadHistory();
            if (selectedHistory?.opnameDate === recDate) {
                setSelectedHistory(null);
            }
            setSaveStatus({
                type: 'success',
                message: `Riwayat Stock Opname tanggal ${recDate} berhasil dihapus.`
            });
        } catch (err: any) {
            alert(`Gagal menghapus riwayat: ${err.message || err}`);
        }
    };

    const copySqlToClipboard = () => {
        const sql = `CREATE TABLE IF NOT EXISTS public.stock_opname (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opname_date DATE NOT NULL,
    items_id UUID REFERENCES public.items(id),
    item_code TEXT,
    item_name TEXT,
    quantity_pcs INTEGER NOT NULL DEFAULT 0,
    quantity_kgs NUMERIC(10,2) NOT NULL DEFAULT 0,
    production_date DATE,
    slaughtering_date DATE,
    source TEXT,
    allocation TEXT,
    status_wip BOOLEAN DEFAULT false,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index untuk performa query harian
CREATE INDEX IF NOT EXISTS idx_stock_opname_date ON public.stock_opname(opname_date);`;

        navigator.clipboard.writeText(sql);
        setCopiedSql(true);
        setTimeout(() => setCopiedSql(false), 2500);
    };

    // Filtered rows for fast visual check
    const filteredRows = useMemo(() => {
        if (!searchTerm.trim()) return rows;
        const q = searchTerm.toLowerCase();
        return rows.filter(r =>
            r.itemCode.toLowerCase().includes(q) ||
            r.itemName.toLowerCase().includes(q) ||
            r.source.toLowerCase().includes(q) ||
            r.allocation.toLowerCase().includes(q)
        );
    }, [rows, searchTerm]);

    if (!isSuperAdmin) {
        return (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-8 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                    <AlertTriangle size={24} />
                </div>
                <h3 className="text-base font-black uppercase tracking-tight">Akses Khusus Superadmin</h3>
                <p className="text-xs font-medium text-amber-700 max-w-md mx-auto">
                    Fitur Stock Opname hanya dapat dilihat dan dikelola oleh Superadmin. Silakan hubungi Superadmin jika Anda memerlukan penyesuaian stok fisik.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {/* Top Banner / Info */}
            <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-semibold mb-2">
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            Rekonsiliasi & Hitung Ulang Fisik
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">Stock Opname Fisik Chiller</h2>
                        <p className="text-red-100 text-sm mt-1 max-w-2xl">
                            Hitung ulang seluruh stok fisik chiller pada tanggal tertentu. Hasil Stock Opname ini otomatis
                            menjadi <strong>Stok Awal (Opening Stock)</strong> pada Laporan Stok Harian dan menyelaraskan stok aktif di Chiller.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-center">
                        <button
                            onClick={() => setShowSqlGuide(!showSqlGuide)}
                            className="px-3.5 py-2 bg-white/15 hover:bg-white/25 backdrop-blur-md rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all text-white border border-white/20"
                            title="Informasi Schema Tabel Supabase"
                        >
                            <Database className="w-3.5 h-3.5" />
                            <span>Info Tabel Cloud</span>
                            {showSqlGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* SQL Setup Modal / Accordion */}
            {showSqlGuide && (
                <div className="bg-slate-900 border border-slate-700 text-slate-100 p-5 rounded-2xl shadow-xl transition-all">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                                <Database className="w-4 h-4" />
                                Dual-Persistence: Supabase & LocalStorage
                            </div>
                            <p className="text-xs text-slate-300 mt-1">
                                Aplikasi ini secara otomatis menyimpan data Stock Opname ke <strong>LocalStorage</strong> (tersimpan di browser)
                                dan mencoba menyelaraskan ke tabel <code>stock_opname</code> di <strong>Supabase</strong>.
                                Untuk mengaktifkan tabel permanen di Supabase, Anda dapat menjalankan perintah SQL berikut di Supabase SQL Editor:
                            </p>
                        </div>
                        <button
                            onClick={copySqlToClipboard}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            {copiedSql ? 'Tersalin!' : 'Salin SQL'}
                        </button>
                    </div>
                    <pre className="mt-3 bg-black/60 p-3 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto border border-slate-800">
                        {`CREATE TABLE IF NOT EXISTS public.stock_opname (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opname_date DATE NOT NULL,
    items_id UUID REFERENCES public.items(id),
    item_code TEXT,
    item_name TEXT,
    quantity_pcs INTEGER NOT NULL DEFAULT 0,
    quantity_kgs NUMERIC(10,2) NOT NULL DEFAULT 0,
    production_date DATE,
    slaughtering_date DATE,
    source TEXT,
    allocation TEXT,
    status_wip BOOLEAN DEFAULT false,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);`}
                    </pre>
                </div>
            )}

            {/* Viewer Warning */}
            {isViewer && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div className="text-sm">
                        <span className="font-semibold">Mode Viewer (Hanya Lihat):</span> Anda dapat melihat riwayat Stock Opname dan mengunduh template, namun tidak memiliki izin untuk menyimpan atau mengubah stok fisik.
                    </div>
                </div>
            )}

            {/* Save Status Banner */}
            {saveStatus && (
                <div className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm transition-all ${saveStatus.type === 'success'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border border-rose-200 text-rose-800'
                    }`}>
                    <div className="flex items-center gap-2">
                        {saveStatus.type === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        ) : (
                            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                        )}
                        <span>{saveStatus.message}</span>
                    </div>
                    <button
                        onClick={() => setSaveStatus(null)}
                        className="text-xs opacity-75 hover:opacity-100 underline shrink-0"
                    >
                        Tutup
                    </button>
                </div>
            )}

            {/* Control Panel & Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Opname Date & Sync Settings */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
                        <Calendar className="w-4 h-4 text-red-600" />
                        Pengaturan Tanggal & Penyelarasan
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                Tanggal Stock Opname <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                value={opnameDate}
                                onChange={e => {
                                    const newDate = e.target.value;
                                    setOpnameDate(newDate);
                                    // Update dates on rows if they match the previous opnameDate
                                    setRows(prev => prev.map(r => ({
                                        ...r,
                                        productionDate: r.productionDate === opnameDate ? newDate : r.productionDate,
                                        slaughteringDate: r.slaughteringDate === opnameDate ? newDate : r.slaughteringDate
                                    })));
                                }}
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition-all"
                            />
                            <span className="text-[11px] text-slate-400 mt-1 block">
                                Stok awal pada tanggal ini akan digantikan oleh hasil opname.
                            </span>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                                Aksi Terhadap Stok Fisik Chiller
                            </label>
                            <label className="flex items-start gap-2.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition-colors">
                                <input
                                    type="checkbox"
                                    checked={syncChiller}
                                    onChange={e => setSyncChiller(e.target.checked)}
                                    disabled={isViewer}
                                    className="mt-0.5 rounded text-red-600 focus:ring-red-500 h-4 w-4"
                                />
                                <span className="text-xs text-slate-700 leading-snug">
                                    <strong>Selaraskan Stok Aktif Chiller</strong>
                                    <br />
                                    <span className="text-slate-400 text-[11px]">
                                        Reset stok chiller aktif dan ganti dengan hasil opname ini.
                                    </span>
                                </span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Quick Summary Cards */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Item Opname</div>
                    <div className="my-2">
                        <span className="text-3xl font-extrabold text-slate-800">{totalRows}</span>
                        <span className="text-xs text-slate-400 ml-1.5">baris</span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        <span>{rows.filter(r => r.isWIP).length} item WIP / {rows.filter(r => !r.isWIP).length} Standar</span>
                    </div>
                </div>

                <div className="bg-red-50/70 border border-red-100 rounded-2xl p-5 flex flex-col justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-red-500">Total Kuantitas Fisik</div>
                    <div className="my-2">
                        <div className="text-2xl font-black text-red-700">
                            {formatNumber(totalKgs, 2)} <span className="text-xs font-normal text-red-500">kg</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-600 mt-0.5">
                            {formatNumber(totalPcs)} <span className="text-xs font-normal text-slate-400">pcs</span>
                        </div>
                    </div>
                    <div className="text-xs text-red-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Siap disinkronkan ke Stok Harian</span>
                    </div>
                </div>
            </div>

            {/* Action Toolbar: Add row, Excel template, Excel import, Save */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleAddRow}
                        disabled={isViewer}
                        className="px-3.5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Tambah Baris</span>
                    </button>

                    <button
                        onClick={handleClearAll}
                        disabled={isViewer || rows.length === 0}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Reset</span>
                    </button>

                    <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

                    {/* Excel Template & Import */}
                    <button
                        onClick={handleDownloadTemplate}
                        className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                        title="Download Template Excel untuk diisi secara offline"
                    >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Download Template Excel</span>
                    </button>

                    <label
                        className={`px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer ${isViewer ? 'opacity-50 pointer-events-none' : ''
                            }`}
                        title="Import hasil penghitungan fisik dari file Excel"
                    >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Import Excel</span>
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept=".xlsx,.xls,.csv"
                            onChange={handleImportExcel}
                            disabled={isViewer}
                            className="hidden"
                        />
                    </label>
                </div>

                {/* Right side: Search in table & Submit */}
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-56">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Cari item / kode..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500"
                        />
                    </div>

                    <button
                        onClick={handleApplyOpname}
                        disabled={isViewer || isSaving || rows.length === 0}
                        className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-95 shrink-0"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Menyimpan...' : 'Terapkan & Simpan Stock Opname'}</span>
                    </button>
                </div>
            </div>

            {/* Main Multi-Row Interactive Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold tracking-wide">
                                <th className="py-3 px-3 text-center w-12">No</th>
                                <th className="py-3 px-3 min-w-[240px]">Item (Kode & Nama) <span className="text-red-500">*</span></th>
                                <th className="py-3 px-3 min-w-[130px]">Tgl Produksi (PD)</th>
                                <th className="py-3 px-3 min-w-[130px]">Tgl Potong (SD)</th>
                                <th className="py-3 px-3 min-w-[110px]">Sumber</th>
                                <th className="py-3 px-3 min-w-[110px]">Alokasi</th>
                                <th className="py-3 px-3 w-28 text-right">Pcs</th>
                                <th className="py-3 px-3 w-32 text-right">Kg</th>
                                <th className="py-3 px-3 text-center w-20">WIP</th>
                                <th className="py-3 px-3 text-center w-24">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredRows.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="py-12 text-center text-slate-400">
                                        <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                        Tidak ada baris yang sesuai kriteria pencarian.
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row, idx) => {
                                    const actualIdx = rows.findIndex(r => r.id === row.id);
                                    return (
                                        <tr
                                            key={row.id}
                                            className={`hover:bg-red-50/30 transition-colors ${row.isWIP ? 'bg-amber-50/20' : ''}`}
                                        >
                                            {/* No */}
                                            <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                                                {actualIdx + 1}
                                            </td>

                                            {/* Item Dropdown */}
                                            <td className="py-2.5 px-3">
                                                <select
                                                    value={row.itemsId}
                                                    onChange={e => handleRowChange(actualIdx, 'itemsId', e.target.value)}
                                                    disabled={isViewer}
                                                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white truncate"
                                                >
                                                    <option value="">-- Pilih Item --</option>
                                                    {itemsList.map(it => (
                                                        <option key={it.id} value={it.id}>
                                                            [{it.code}] {it.description}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Production Date */}
                                            <td className="py-2.5 px-3">
                                                <input
                                                    type="date"
                                                    value={row.productionDate}
                                                    onChange={e => handleRowChange(actualIdx, 'productionDate', e.target.value)}
                                                    disabled={isViewer}
                                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white"
                                                />
                                            </td>

                                            {/* Slaughtering Date */}
                                            <td className="py-2.5 px-3">
                                                <input
                                                    type="date"
                                                    value={row.slaughteringDate}
                                                    onChange={e => handleRowChange(actualIdx, 'slaughteringDate', e.target.value)}
                                                    disabled={isViewer}
                                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white"
                                                />
                                            </td>

                                            {/* Source */}
                                            <td className="py-2.5 px-3">
                                                <select
                                                    value={row.source}
                                                    onChange={e => handleRowChange(actualIdx, 'source', e.target.value)}
                                                    disabled={isViewer}
                                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white"
                                                >
                                                    {defaultSources.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Allocation */}
                                            <td className="py-2.5 px-3">
                                                <select
                                                    value={row.allocation}
                                                    onChange={e => handleRowChange(actualIdx, 'allocation', e.target.value)}
                                                    disabled={isViewer}
                                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white"
                                                >
                                                    {defaultSources.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Pcs */}
                                            <td className="py-2.5 px-3 text-right">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={row.pcs === 0 ? '' : row.pcs}
                                                    placeholder="0"
                                                    onChange={e => handleRowChange(actualIdx, 'pcs', Math.max(0, parseInt(e.target.value) || 0))}
                                                    disabled={isViewer}
                                                    className="w-full px-2 py-1.5 text-right font-mono bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white font-semibold"
                                                />
                                            </td>

                                            {/* Kg */}
                                            <td className="py-2.5 px-3 text-right">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={row.kgs === 0 ? '' : row.kgs}
                                                    placeholder="0.00"
                                                    onChange={e => handleRowChange(actualIdx, 'kgs', Math.max(0, parseFloat(e.target.value) || 0))}
                                                    disabled={isViewer}
                                                    className="w-full px-2 py-1.5 text-right font-mono bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white font-semibold text-red-600"
                                                />
                                            </td>

                                            {/* WIP checkbox */}
                                            <td className="py-2.5 px-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={row.isWIP}
                                                    onChange={e => handleRowChange(actualIdx, 'isWIP', e.target.checked)}
                                                    disabled={isViewer}
                                                    className="rounded text-amber-600 focus:ring-amber-500 h-4 w-4"
                                                    title="Tandai sebagai Work In Progress (WIP)"
                                                />
                                            </td>

                                            {/* Actions: Duplicate / Delete */}
                                            <td className="py-2.5 px-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => handleDuplicateRow(actualIdx)}
                                                        disabled={isViewer}
                                                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                                                        title="Duplikat baris ini"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveRow(actualIdx)}
                                                        disabled={isViewer}
                                                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                                        title="Hapus baris"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 font-semibold text-slate-800 border-t-2 border-slate-200">
                                <td colSpan={6} className="py-3 px-3 text-right text-xs uppercase tracking-wider text-slate-600">
                                    Total Fisik Opname:
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-xs font-bold text-slate-900">
                                    {formatNumber(totalPcs)} pcs
                                </td>
                                <td className="py-3 px-3 text-right font-mono text-xs font-black text-red-700">
                                    {formatNumber(totalKgs, 2)} kg
                                </td>
                                <td colSpan={2} />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Opname History Section */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <History className="w-5 h-5 text-red-600" />
                        <h3 className="font-bold text-slate-800 text-sm">Riwayat Stock Opname Fisik</h3>
                        <span className="text-xs text-slate-400">({history.length} kali pencatatan)</span>
                    </div>

                    <button
                        onClick={loadHistory}
                        className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1"
                    >
                        <RotateCcw className="w-3 h-3" />
                        Muat Ulang
                    </button>
                </div>

                {history.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Belum ada riwayat Stock Opname yang tercatat. Silakan input dan terapkan stock opname pertama di atas.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {history.map(rec => (
                            <div
                                key={rec.id || rec.opnameDate}
                                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-red-200 hover:shadow-sm transition-all flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 font-bold rounded-lg text-xs">
                                            <Calendar className="w-3 h-3" />
                                            {rec.opnameDate}
                                        </span>
                                        <span className="text-[11px] text-slate-400">
                                            {rec.items.length} item
                                        </span>
                                    </div>

                                    <div className="space-y-1 my-2.5 text-xs text-slate-700">
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Total Berat:</span>
                                            <span className="font-bold text-red-600 font-mono">{formatNumber(rec.totalKgs, 2)} kg</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-500">Total Kuantitas:</span>
                                            <span className="font-semibold text-slate-800 font-mono">{formatNumber(rec.totalPcs)} pcs</span>
                                        </div>
                                        <div className="flex justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-200">
                                            <span>Pencatat:</span>
                                            <span>{rec.createdBy || 'Admin'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                                    <button
                                        onClick={() => setSelectedHistory(rec)}
                                        className="flex-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                                    >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>Lihat Detail</span>
                                    </button>
                                    <button
                                        onClick={() => handleLoadPastRecord(rec)}
                                        disabled={isViewer}
                                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-600 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                                        title="Muat data ini ke editor di atas"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Muat</span>
                                    </button>
                                    {isSuperAdmin && (
                                        <button
                                            onClick={() => handleDeletePastRecord(rec.opnameDate)}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                            title="Hapus riwayat opname ini"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Detail History Modal */}
            {selectedHistory && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                                    <ClipboardCheck className="w-5 h-5 text-red-600" />
                                    Detail Stock Opname: {selectedHistory.opnameDate}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Dicatat oleh {selectedHistory.createdBy} pada {new Date(selectedHistory.createdAt).toLocaleString('id-ID')}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedHistory(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl text-center text-xs">
                                <div>
                                    <span className="text-slate-400 block">Total Item</span>
                                    <span className="text-sm font-bold text-slate-800">{selectedHistory.items.length}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block">Total Pcs</span>
                                    <span className="text-sm font-bold text-slate-800 font-mono">{formatNumber(selectedHistory.totalPcs)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block">Total Berat</span>
                                    <span className="text-sm font-bold text-red-600 font-mono">{formatNumber(selectedHistory.totalKgs, 2)} kg</span>
                                </div>
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                        <tr>
                                            <th className="py-2.5 px-3">Kode</th>
                                            <th className="py-2.5 px-3">Nama Item</th>
                                            <th className="py-2.5 px-3">PD</th>
                                            <th className="py-2.5 px-3">SD</th>
                                            <th className="py-2.5 px-3">Sumber</th>
                                            <th className="py-2.5 px-3">Alokasi</th>
                                            <th className="py-2.5 px-3 text-right">Pcs</th>
                                            <th className="py-2.5 px-3 text-right">Kg</th>
                                            <th className="py-2.5 px-3 text-center">WIP</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {selectedHistory.items.map((it, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="py-2 px-3 font-mono font-medium text-slate-900">{it.itemCode}</td>
                                                <td className="py-2 px-3 text-slate-700">{it.itemName}</td>
                                                <td className="py-2 px-3 text-slate-500">{it.productionDate}</td>
                                                <td className="py-2 px-3 text-slate-500">{it.slaughteringDate}</td>
                                                <td className="py-2 px-3 text-slate-600">{it.source}</td>
                                                <td className="py-2 px-3 text-slate-600">{it.allocation}</td>
                                                <td className="py-2 px-3 text-right font-mono">{formatNumber(it.pcs)}</td>
                                                <td className="py-2 px-3 text-right font-mono font-bold text-red-600">{formatNumber(it.kgs, 2)}</td>
                                                <td className="py-2 px-3 text-center">
                                                    {it.isWIP ? (
                                                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">WIP</span>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between rounded-b-2xl">
                            <button
                                onClick={() => {
                                    handleLoadPastRecord(selectedHistory);
                                }}
                                disabled={isViewer}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                            >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Muat ke Editor</span>
                            </button>

                            <button
                                onClick={() => setSelectedHistory(null)}
                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-medium transition-colors"
                            >
                                Tutup
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockOpnameTab;
