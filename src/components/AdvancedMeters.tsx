import React, { useEffect, useRef, useState } from 'react';
import { AudioMetrics } from '../types';
import { lufsMeteringService, LUFSMeasurement, STREAMING_TARGETS } from '../services/lufsMetering';

interface PhaseCorrelationMeterProps {
    analyser: AnalyserNode | null;
    audioContext: AudioContext | null;
}

/**
 * Phase Correlation Meter
 * Shows the correlation between left and right channels
 * +1 = perfect mono, 0 = uncorrelated, -1 = completely out of phase
 */
export const PhaseCorrelationMeter: React.FC<PhaseCorrelationMeterProps> = ({ analyser, audioContext }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);

    useEffect(() => {
        if (!analyser || !audioContext || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyser.fftSize;
        const dataArrayL = new Float32Array(bufferLength);
        const dataArrayR = new Float32Array(bufferLength);

        // Create splitter to get separate channels
        const splitter = audioContext.createChannelSplitter(2);
        const analyserL = audioContext.createAnalyser();
        const analyserR = audioContext.createAnalyser();

        analyser.connect(splitter);
        splitter.connect(analyserL, 0);
        splitter.connect(analyserR, 1);

        const draw = () => {
            animationRef.current = requestAnimationFrame(draw);

            analyserL.getFloatTimeDomainData(dataArrayL);
            analyserR.getFloatTimeDomainData(dataArrayR);

            // Calculate phase correlation
            let sumLR = 0;
            let sumLL = 0;
            let sumRR = 0;

            for (let i = 0; i < bufferLength; i++) {
                sumLR += dataArrayL[i] * dataArrayR[i];
                sumLL += dataArrayL[i] * dataArrayL[i];
                sumRR += dataArrayR[i] * dataArrayR[i];
            }

            const correlation = sumLR / Math.sqrt(sumLL * sumRR) || 0;

            // Draw meter
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Background
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Scale
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, 0);
            ctx.lineTo(canvas.width / 2, canvas.height);
            ctx.stroke();

            // Color gradient based on correlation
            let barColor;
            if (correlation > 0.8) barColor = '#22c55e'; // Green - good stereo
            else if (correlation > 0.3) barColor = '#eab308'; // Yellow - moderate
            else if (correlation > -0.3) barColor = '#f97316'; // Orange - wide stereo
            else barColor = '#ef4444'; // Red - phase issues

            // Draw correlation bar
            const barWidth = Math.abs(correlation) * (canvas.width / 2);
            const barX = correlation > 0 ? canvas.width / 2 : canvas.width / 2 - barWidth;

            ctx.fillStyle = barColor;
            ctx.fillRect(barX, 10, barWidth, canvas.height - 20);

            // Draw value text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(correlation.toFixed(2), canvas.width / 2, canvas.height / 2 + 5);

            // Labels
            ctx.font = '11px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'left';
            ctx.fillText('-1', 5, canvas.height - 5);
            ctx.textAlign = 'center';
            ctx.fillText('0', canvas.width / 2, canvas.height - 5);
            ctx.textAlign = 'right';
            ctx.fillText('+1', canvas.width - 5, canvas.height - 5);
        };

        draw();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [analyser, audioContext]);

    return (
        <div className="bg-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Phase Correlation</h3>
            <canvas ref={canvasRef} width={300} height={60} className="w-full" />
            <p className="text-xs text-slate-400 mt-2">
                +1 = Mono | 0 = Stereo | -1 = Phase Issues
            </p>
        </div>
    );
};

interface StereoFieldMeterProps {
    analyser: AnalyserNode | null;
    audioContext: AudioContext | null;
}

/**
 * Stereo Field Visualizer (Goniometer)
 * Shows the stereo width and balance in real-time
 */
export const StereoFieldMeter: React.FC<StereoFieldMeterProps> = ({ analyser, audioContext }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);

    useEffect(() => {
        if (!analyser || !audioContext || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;

        const bufferLength = 512;
        const dataArrayL = new Float32Array(bufferLength);
        const dataArrayR = new Float32Array(bufferLength);

        const splitter = audioContext.createChannelSplitter(2);
        const analyserL = audioContext.createAnalyser();
        const analyserR = audioContext.createAnalyser();

        analyserL.fftSize = bufferLength * 2;
        analyserR.fftSize = bufferLength * 2;

        analyser.connect(splitter);
        splitter.connect(analyserL, 0);
        splitter.connect(analyserR, 1);

        const draw = () => {
            animationRef.current = requestAnimationFrame(draw);

            analyserL.getFloatTimeDomainData(dataArrayL);
            analyserR.getFloatTimeDomainData(dataArrayR);

            // Clear canvas
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw grid
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;

            // Diagonal lines (M-S representation)
            ctx.beginPath();
            ctx.moveTo(0, canvas.height);
            ctx.lineTo(canvas.width, 0);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(canvas.width, canvas.height);
            ctx.stroke();

            // Center lines
            ctx.strokeStyle = '#475569';
            ctx.beginPath();
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, canvas.height);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, centerY);
            ctx.lineTo(canvas.width, centerY);
            ctx.stroke();

            // Draw stereo field
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();

            for (let i = 0; i < bufferLength; i++) {
                const l = dataArrayL[i];
                const r = dataArrayR[i];

                // Convert L/R to X/Y coordinates
                const x = centerX + (r * radius);
                const y = centerY - (l * radius);

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();
            ctx.globalAlpha = 1.0;

            // Labels
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('L', centerX, 12);
            ctx.fillText('R', centerX, canvas.height - 4);
            ctx.textAlign = 'left';
            ctx.fillText('M', 4, centerY + 4);
            ctx.textAlign = 'right';
            ctx.fillText('S', canvas.width - 4, centerY + 4);
        };

        draw();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [analyser, audioContext]);

    return (
        <div className="bg-slate-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Stereo Field</h3>
            <canvas ref={canvasRef} width={200} height={200} className="w-full" />
            <p className="text-xs text-slate-400 mt-2">
                Goniometer - Stereo width visualization
            </p>
        </div>
    );
};

interface LUFSMeterProps {
    buffer: AudioBuffer | null;
    onMeasurementComplete?: (measurement: LUFSMeasurement) => void;
}

/**
 * LUFS Meter with streaming compliance indicators
 */
export const LUFSMeter: React.FC<LUFSMeterProps> = ({ buffer, onMeasurementComplete }) => {
    const [measurement, setMeasurement] = useState<LUFSMeasurement | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => {
        if (!buffer) return;

        setIsAnalyzing(true);
        lufsMeteringService.measureLUFS(buffer).then(result => {
            setMeasurement(result);
            setIsAnalyzing(false);
            if (onMeasurementComplete) {
                onMeasurementComplete(result);
            }
        });
    }, [buffer, onMeasurementComplete]);

    if (!measurement && !isAnalyzing) {
        return (
            <div className="bg-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">LUFS Metering</h3>
                <p className="text-sm text-slate-400">Load audio to analyze loudness</p>
            </div>
        );
    }

    if (isAnalyzing) {
        return (
            <div className="bg-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">LUFS Metering</h3>
                <p className="text-sm text-slate-400">Analyzing loudness...</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">LUFS Metering</h3>

            {/* Integrated LUFS */}
            <div>
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Integrated</span>
                    <span className="text-white font-bold">{measurement!.integratedLUFS.toFixed(1)} LUFS</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-green-500 to-yellow-500"
                        style={{ width: `${Math.min(100, ((measurement!.integratedLUFS + 30) / 30) * 100)}%` }}
                    />
                </div>
            </div>

            {/* True Peak */}
            <div>
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">True Peak</span>
                    <span className={`font-bold ${measurement!.truePeak > -1 ? 'text-red-500' : 'text-white'}`}>
                        {measurement!.truePeak.toFixed(1)} dBTP
                    </span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${measurement!.truePeak > -1 ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(100, ((measurement!.truePeak + 12) / 12) * 100)}%` }}
                    />
                </div>
            </div>

            {/* Loudness Range */}
            <div>
                <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Loudness Range</span>
                    <span className="text-white font-bold">{measurement!.loudnessRange.toFixed(1)} LU</span>
                </div>
            </div>

            {/* Streaming Compliance */}
            <div className="border-t border-slate-700 pt-3">
                <p className="text-xs font-semibold text-slate-300 mb-2">Platform Compliance</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(STREAMING_TARGETS).slice(0, 4).map(([key, target]) => (
                        <div key={key} className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${measurement!.targetCompliance[key as keyof typeof measurement.targetCompliance] ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-slate-400">{target.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recommendations */}
            {measurement!.truePeak > -1 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                    <p className="text-xs text-red-400">
                        True peak exceeds -1 dBTP. Risk of clipping on some platforms.
                    </p>
                </div>
            )}
        </div>
    );
};