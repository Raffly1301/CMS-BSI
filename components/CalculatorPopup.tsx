import React, { useState, useEffect } from 'react';
import { Calculator, X, CornerDownLeft, Delete } from 'lucide-react';

interface CalculatorPopupProps {
    initialValue?: number;
    onApply: (value: number) => void;
    onClose: () => void;
    title: string;
}

export const evaluateMath = (str: string): number => {
    // Sanitize expression: allow only numbers, operators, dots, parentheses, and spaces
    const sanitized = str
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/[^0-9+\-*/().\s]/g, '');

    if (!sanitized.trim()) return 0;

    try {
        // Safe evaluated sandbox code via sanitization
        const result = new Function(`return (${sanitized})`)();
        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
            return result;
        }
    } catch (e) {
        // Expect syntax errors while typing is incomplete
    }
    return 0;
};

const CalculatorPopup: React.FC<CalculatorPopupProps> = ({ initialValue, onApply, onClose, title }) => {
    const [expression, setExpression] = useState<string>('');
    const [liveResult, setLiveResult] = useState<number>(initialValue || 0);

    // Initialize with initial value if any
    useEffect(() => {
        if (initialValue && initialValue > 0) {
            setExpression(String(initialValue));
            setLiveResult(initialValue);
        }
    }, [initialValue]);

    // Track and process real-time calculations
    useEffect(() => {
        const res = evaluateMath(expression);
        setLiveResult(res);
    }, [expression]);

    // Handle click on keypad button
    const handleInput = (val: string) => {
        setExpression(prev => {
            // Prevent consecutive operators if necessary, but standard math is fine
            return prev + val;
        });
    };

    const handleClear = () => {
        setExpression('');
    };

    const handleBackspace = () => {
        setExpression(prev => prev.slice(0, -1));
    };

    const handleEvaluate = () => {
        const finalVal = evaluateMath(expression);
        onApply(Number(finalVal.toFixed(2)));
        onClose();
    };

    // Keyboard support for ease of use
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const { key } = e;
            if (/[0-9]/.test(key)) {
                handleInput(key);
            } else if (key === '+') {
                handleInput('+');
            } else if (key === '-') {
                handleInput('-');
            } else if (key === '*') {
                handleInput('×');
            } else if (key === '/') {
                handleInput('÷');
            } else if (key === '.' || key === ',') {
                handleInput('.');
            } else if (key === '(' || key === ')') {
                handleInput(key);
            } else if (key === 'Enter') {
                e.preventDefault();
                handleEvaluate();
            } else if (key === 'Backspace') {
                e.preventDefault();
                handleBackspace();
            } else if (key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [expression]);

    const buttons = [
        { label: '(', type: 'special' },
        { label: ')', type: 'special' },
        { label: 'C', type: 'clear' },
        { label: '÷', type: 'operator' },
        { label: '7', type: 'number' },
        { label: '8', type: 'number' },
        { label: '9', type: 'number' },
        { label: '×', type: 'operator' },
        { label: '4', type: 'number' },
        { label: '5', type: 'number' },
        { label: '6', type: 'number' },
        { label: '-', type: 'operator' },
        { label: '1', type: 'number' },
        { label: '2', type: 'number' },
        { label: '3', type: 'number' },
        { label: '+', type: 'operator' },
        { label: '0', type: 'number' },
        { label: '.', type: 'number' },
        { label: '⌫', type: 'backspace' },
        { label: '=', type: 'apply' },
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
            <div className="bg-white w-full max-w-[290px] rounded-3xl border border-gray-100 shadow-2xl p-5 relative flex flex-col gap-4 animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <Calculator size={14} className="text-red-600 animate-pulse" />
                        <span className="text-[9px] font-black tracking-wider text-gray-400 uppercase">{title}</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 px-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600 rounded-lg transition-colors cursor-pointer outline-none"
                        title="Tutup"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Display Panel */}
                <div className="bg-gray-50 border border-gray-100/80 rounded-2xl p-3.5 flex flex-col tracking-tight text-right font-mono min-h-[82px] justify-between">
                    <div className="text-xs text-gray-400 font-bold overflow-x-auto whitespace-nowrap py-1 scrollbar-none select-all">
                        {expression || '0'}
                    </div>
                    <div className="text-2xl font-black text-gray-800 flex items-baseline justify-end gap-1 overflow-x-auto whitespace-nowrap scrollbar-none py-1">
                        <span className="text-xs font-black text-gray-400 uppercase mr-1">=</span>
                        {liveResult % 1 === 0 ? liveResult : liveResult.toFixed(2)}
                    </div>
                </div>

                {/* Custom keypad grid */}
                <div className="grid grid-cols-4 gap-2">
                    {buttons.map((b, idx) => {
                        let btnClass = 'h-11 rounded-xl font-bold flex items-center justify-center outline-none transition-all active:scale-95 cursor-pointer text-xs';

                        if (b.type === 'number') {
                            btnClass += ' bg-gray-50 border border-gray-100 text-gray-800 hover:bg-gray-100 hover:border-gray-200';
                        } else if (b.type === 'operator') {
                            btnClass += ' bg-red-50 text-red-600 font-black hover:bg-red-100';
                        } else if (b.type === 'clear') {
                            btnClass += ' bg-red-600 text-white font-black hover:bg-red-700 shadow-md shadow-red-100';
                        } else if (b.type === 'backspace') {
                            btnClass += ' bg-orange-50 text-orange-600 font-black hover:bg-orange-100';
                        } else if (b.type === 'apply') {
                            btnClass += ' bg-green-600 text-white font-black hover:bg-green-700 shadow-md shadow-green-100';
                        } else {
                            btnClass += ' bg-gray-100 text-gray-600 hover:bg-gray-200';
                        }

                        return (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                    if (b.type === 'clear') {
                                        handleClear();
                                    } else if (b.type === 'backspace') {
                                        handleBackspace();
                                    } else if (b.type === 'apply') {
                                        handleEvaluate();
                                    } else {
                                        handleInput(b.label);
                                    }
                                }}
                                className={btnClass}
                            >
                                {b.label}
                            </button>
                        );
                    })}
                </div>

                {/* Submit button bar */}
                <button
                    type="button"
                    onClick={handleEvaluate}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl text-[10px] flex items-center justify-center gap-1.5 shadow-lg shadow-red-100 active:scale-95 transition-all uppercase outline-none cursor-pointer"
                >
                    <CornerDownLeft size={13} />
                    Terapkan Nilai
                </button>

            </div>
        </div>
    );
};

export default CalculatorPopup;
