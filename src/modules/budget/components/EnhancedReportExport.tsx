/**
 * EnhancedReportExport - Premium PDF export with charts, visualizations, and branding
 * Generates professional reports with:
 * - Church logo and branding
 * - Interactive charts converted to images
 * - Comprehensive analytics
 * - Ministry-specific personalization
 */

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/shared/components/ui/dropdown-menu";
import { Download, Printer, FileText } from "lucide-react";
import type {
  ExpenseRequestWithRelations,
  AllocationRequestWithRelations,
  AttachmentData,
} from "../types";
import { REIMBURSEMENT_TYPE_LABELS } from "../types";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { useRef, useState } from "react";
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  AreaChart,
  Area,
} from "recharts";

interface EnhancedReportExportProps {
  expenses: ExpenseRequestWithRelations[];
  allocations: AllocationRequestWithRelations[];
  userName: string;
  organizationName: string;
  ministryName?: string;
  fiscalYearName?: string;
  isContributor?: boolean;
}

const COLORS = {
  expenses: {
    pending_leader: "#f59e0b",
    pending_treasury: "#f97316",
    pending_finance: "#fb923c",
    leader_approved: "#10b981",
    treasury_approved: "#059669",
    completed: "#22c55e",
    rejected: "#ef4444",
    draft: "#94a3b8",
  },
  allocations: {
    pending: "#f59e0b",
    approved: "#10b981",
    partially_approved: "#3b82f6",
    rejected: "#ef4444",
  },
  chart: ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#6366f1"],
};

export const EnhancedReportExport = ({
  expenses,
  allocations,
  userName,
  organizationName,
  ministryName = "Personal",
  fiscalYearName,
  isContributor = false,
}: EnhancedReportExportProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const chartsRef = useRef<HTMLDivElement>(null);

  // Calculate comprehensive statistics
  const calculateStats = () => {
    const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    const expenseApproved = expenses
      .filter((e) =>
        ["treasury_approved", "leader_approved", "completed"].includes(e.status)
      )
      .reduce((sum, e) => sum + e.amount, 0);
    const expensePending = expenses
      .filter((e) =>
        ["pending_leader", "pending_treasury", "pending_finance"].includes(
          e.status
        )
      )
      .reduce((sum, e) => sum + e.amount, 0);

    const allocationTotal = allocations.reduce(
      (sum, a) => sum + a.requested_amount,
      0
    );
    const allocationApproved = allocations
      .filter((a) => a.status === "approved")
      .reduce((sum, a) => sum + (a.approved_amount || a.requested_amount), 0);
    const allocationPending = allocations
      .filter((a) => a.status === "pending")
      .reduce((sum, a) => sum + a.requested_amount, 0);

    return {
      expenses: {
        total: expenseTotal,
        approved: expenseApproved,
        pending: expensePending,
        count: expenses.length,
        approvalRate:
          expenses.length > 0
            ? (
                (expenses.filter((e) =>
                  [
                    "treasury_approved",
                    "leader_approved",
                    "completed",
                  ].includes(e.status)
                ).length /
                  expenses.length) *
                100
              ).toFixed(1)
            : "0",
      },
      allocations: {
        total: allocationTotal,
        approved: allocationApproved,
        pending: allocationPending,
        count: allocations.length,
        approvalRate:
          allocations.length > 0
            ? (
                (allocations.filter((a) => a.status === "approved").length /
                  allocations.length) *
                100
              ).toFixed(1)
            : "0",
      },
      combined: {
        total: expenseTotal + allocationTotal,
        approved: expenseApproved + allocationApproved,
        pending: expensePending + allocationPending,
      },
    };
  };

  // Prepare chart data
  const prepareChartData = () => {
    const stats = calculateStats();

    // Status breakdown for expenses
    const expenseStatusData = expenses.reduce((acc, expense) => {
      const status = expense.status;
      if (!acc[status]) {
        acc[status] = { count: 0, amount: 0 };
      }
      acc[status].count += 1;
      acc[status].amount += expense.amount;
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

    const expenseChartData = Object.entries(expenseStatusData).map(
      ([status, data]) => ({
        name: status
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        value: data.amount,
        count: data.count,
      })
    );

    // Status breakdown for allocations
    const allocationStatusData = allocations.reduce((acc, allocation) => {
      const status = allocation.status;
      if (!acc[status]) {
        acc[status] = { count: 0, amount: 0 };
      }
      acc[status].count += 1;
      acc[status].amount += allocation.requested_amount;
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

    const allocationChartData = Object.entries(allocationStatusData).map(
      ([status, data]) => ({
        name: status
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        value: data.amount,
        count: data.count,
      })
    );

    // Ministry breakdown
    const ministryData = [...expenses, ...allocations].reduce((acc, item) => {
      const ministry =
        "ministry" in item ? item.ministry?.name || "Unknown" : "Unknown";
      const amount = "amount" in item ? item.amount : item.requested_amount;
      if (!acc[ministry]) {
        acc[ministry] = 0;
      }
      acc[ministry] += amount;
      return acc;
    }, {} as Record<string, number>);

    const ministryChartData = Object.entries(ministryData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5 ministries

    // Monthly trend (last 6 months)
    const monthlyData = [...expenses, ...allocations].reduce((acc, item) => {
      const date = new Date(item.created_at);
      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      const amount = "amount" in item ? item.amount : item.requested_amount;
      if (!acc[monthKey]) {
        acc[monthKey] = { expenses: 0, allocations: 0 };
      }
      if ("amount" in item) {
        acc[monthKey].expenses += amount;
      } else {
        acc[monthKey].allocations += amount;
      }
      return acc;
    }, {} as Record<string, { expenses: number; allocations: number }>);

    const monthlyChartData = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, data]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        expenses: data.expenses,
        allocations: data.allocations,
        total: data.expenses + data.allocations,
      }));

    return {
      expenseChartData,
      allocationChartData,
      ministryChartData,
      monthlyChartData,
    };
  };

  const generateEnhancedPDF = async () => {
    setIsGenerating(true);

    try {
      const doc = new jsPDF();
      const margin = 14;
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      let currentY = 20;

      const stats = calculateStats();
      const chartData = prepareChartData();

      // Modern gradient header background
      doc.setFillColor(30, 64, 175); // Blue-800
      doc.rect(0, 0, pageWidth, 45, "F");

      // Subtle accent stripe
      doc.setFillColor(59, 130, 246); // Blue-500
      doc.rect(0, 42, pageWidth, 3, "F");

      // Add church logo
      try {
        const logoImg = await loadImage("/church-logo.png");
        doc.addImage(logoImg, "PNG", margin, 8, 28, 28);
      } catch (error) {
        // Add placeholder icon if no logo
        doc.setFillColor(255, 255, 255);
        doc.circle(margin + 14, 22, 12, "F");
        doc.setFontSize(16);
        doc.setTextColor(30, 64, 175);
        doc.text("$", margin + 11, 26);
      }

      // Header text
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(`${ministryName} Budget Report`, 50, 18);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(191, 219, 254); // Blue-200
      doc.text(`${organizationName}  •  ${userName}  •  ${fiscalYearName || "All Periods"}`, 50, 28);
      doc.text(
        `Generated: ${new Date().toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}`,
        50,
        36
      );

      currentY = 55;

      // Executive Summary Section - Modern Card Design
      const cardWidth = (pageWidth - 2 * margin - 10) / 3;
      const cardHeight = 38;

      // Card 1: Total Budget
      doc.setFillColor(16, 185, 129); // Emerald-500
      doc.roundedRect(margin, currentY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(209, 250, 229); // Emerald-100
      doc.text("TOTAL BUDGET", margin + 8, currentY + 12);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(`$${stats.combined.total.toLocaleString()}`, margin + 8, currentY + 26);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(209, 250, 229);
      doc.text(`${stats.expenses.count + stats.allocations.count} total requests`, margin + 8, currentY + 34);

      // Card 2: Approved
      doc.setFillColor(59, 130, 246); // Blue-500
      doc.roundedRect(margin + cardWidth + 5, currentY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(191, 219, 254);
      doc.text("APPROVED", margin + cardWidth + 13, currentY + 12);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(`$${stats.combined.approved.toLocaleString()}`, margin + cardWidth + 13, currentY + 26);
      const approvalRate = stats.expenses.count + stats.allocations.count > 0
        ? (((expenses.filter((e) => ["treasury_approved", "leader_approved", "completed"].includes(e.status)).length +
            allocations.filter((a) => a.status === "approved").length) /
            (stats.expenses.count + stats.allocations.count)) * 100).toFixed(0)
        : "0";
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(191, 219, 254);
      doc.text(`${approvalRate}% approval rate`, margin + cardWidth + 13, currentY + 34);

      // Card 3: Pending
      doc.setFillColor(245, 158, 11); // Amber-500
      doc.roundedRect(margin + (cardWidth + 5) * 2, currentY, cardWidth, cardHeight, 3, 3, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(254, 243, 199);
      doc.text("PENDING", margin + (cardWidth + 5) * 2 + 8, currentY + 12);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(`$${stats.combined.pending.toLocaleString()}`, margin + (cardWidth + 5) * 2 + 8, currentY + 26);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(254, 243, 199);
      doc.text("awaiting review", margin + (cardWidth + 5) * 2 + 8, currentY + 34);

      currentY += cardHeight + 15;

      // Expense Details Section
      if (expenses.length > 0) {
        // Check if we need a new page
        if (currentY > pageHeight - 100) {
          doc.addPage();
          currentY = 20;
        }

        // Section header with icon-like styling
        doc.setFillColor(239, 246, 255); // Blue-50
        doc.roundedRect(margin, currentY, pageWidth - 2 * margin, 12, 2, 2, "F");
        doc.setFillColor(59, 130, 246); // Blue-500
        doc.rect(margin, currentY, 4, 12, "F");
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Expense Analysis", margin + 10, currentY + 8);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`${stats.expenses.count} requests  •  $${stats.expenses.total.toLocaleString()} total`, pageWidth - margin - 60, currentY + 8);
        currentY += 18;

        // Combined expense data in single table
        const expenseStatusBreakdown = chartData.expenseChartData.map(
          (item) => [
            item.name,
            item.count.toString(),
            `$${item.value.toLocaleString()}`,
          ]
        );

        // Add totals row
        expenseStatusBreakdown.push([
          "TOTAL",
          stats.expenses.count.toString(),
          `$${stats.expenses.total.toLocaleString()}`,
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["Status", "Count", "Amount"]],
          body: expenseStatusBreakdown,
          theme: "plain",
          headStyles: {
            fillColor: [30, 64, 175],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9,
            cellPadding: 4,
          },
          bodyStyles: {
            fontSize: 9,
            cellPadding: 4,
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252],
          },
          tableWidth: "auto",
          margin: { left: margin, right: margin },
          didParseCell: (data) => {
            // Style the TOTAL row
            if (data.row.index === expenseStatusBreakdown.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [219, 234, 254];
              data.cell.styles.textColor = [30, 64, 175];
            }
          },
        });

        const docWithTable = doc as jsPDF & {
          lastAutoTable?: { finalY: number };
        };
        currentY = (docWithTable.lastAutoTable?.finalY || currentY) + 15;
      }

      // Allocation Details Section
      if (allocations.length > 0) {
        if (currentY > pageHeight - 100) {
          doc.addPage();
          currentY = 20;
        }

        // Section header with icon-like styling
        doc.setFillColor(243, 232, 255); // Violet-100
        doc.roundedRect(margin, currentY, pageWidth - 2 * margin, 12, 2, 2, "F");
        doc.setFillColor(139, 92, 246); // Violet-500
        doc.rect(margin, currentY, 4, 12, "F");
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(109, 40, 217);
        doc.text("Budget Allocation Analysis", margin + 10, currentY + 8);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(`${stats.allocations.count} requests  •  $${stats.allocations.total.toLocaleString()} total`, pageWidth - margin - 60, currentY + 8);
        currentY += 18;

        // Combined allocation data in single table
        const allocationStatusBreakdown = chartData.allocationChartData.map(
          (item) => [
            item.name,
            item.count.toString(),
            `$${item.value.toLocaleString()}`,
          ]
        );

        // Add totals row
        allocationStatusBreakdown.push([
          "TOTAL",
          stats.allocations.count.toString(),
          `$${stats.allocations.total.toLocaleString()}`,
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["Status", "Count", "Amount"]],
          body: allocationStatusBreakdown,
          theme: "plain",
          headStyles: {
            fillColor: [109, 40, 217],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9,
            cellPadding: 4,
          },
          bodyStyles: {
            fontSize: 9,
            cellPadding: 4,
          },
          alternateRowStyles: {
            fillColor: [250, 245, 255],
          },
          tableWidth: "auto",
          margin: { left: margin, right: margin },
          didParseCell: (data) => {
            // Style the TOTAL row
            if (data.row.index === allocationStatusBreakdown.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [233, 213, 255];
              data.cell.styles.textColor = [109, 40, 217];
            }
          },
        });

        const docWithTable = doc as jsPDF & {
          lastAutoTable?: { finalY: number };
        };
        currentY = (docWithTable.lastAutoTable?.finalY || currentY) + 15;
      }

      // Ministry Breakdown - Only show for admins/treasury/finance (not contributors)
      if (!isContributor && chartData.ministryChartData.length > 1) {
        if (currentY > pageHeight - 80) {
          doc.addPage();
          currentY = 20;
        }

        // Section header with icon-like styling
        doc.setFillColor(220, 252, 231); // Emerald-100
        doc.roundedRect(margin, currentY, pageWidth - 2 * margin, 12, 2, 2, "F");
        doc.setFillColor(16, 185, 129); // Emerald-500
        doc.rect(margin, currentY, 4, 12, "F");
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(5, 150, 105);
        doc.text("Top Ministries by Budget Activity", margin + 10, currentY + 8);
        currentY += 18;

        const ministryTableData = chartData.ministryChartData.map((item) => [
          item.name,
          `$${item.value.toLocaleString()}`,
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["Ministry", "Total Amount"]],
          body: ministryTableData,
          theme: "plain",
          headStyles: {
            fillColor: [5, 150, 105],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9,
            cellPadding: 4,
          },
          bodyStyles: {
            fontSize: 9,
            cellPadding: 4,
          },
          alternateRowStyles: {
            fillColor: [240, 253, 244],
          },
          tableWidth: "auto",
          margin: { left: margin, right: margin },
        });

        const docWithTable = doc as jsPDF & {
          lastAutoTable?: { finalY: number };
        };
        currentY = (docWithTable.lastAutoTable?.finalY || currentY) + 15;
      }

      // Recent Transactions
      if (expenses.length > 0 || allocations.length > 0) {
        doc.addPage();
        currentY = 20;

        // Page header for new page
        doc.setFillColor(30, 64, 175);
        doc.rect(0, 0, pageWidth, 18, "F");
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("Recent Transactions", margin, 12);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(191, 219, 254);
        doc.text(`${ministryName}  •  ${organizationName}`, pageWidth - margin, 12, { align: "right" });
        currentY = 28;

        if (expenses.length > 0) {
          // Expense section header
          doc.setFillColor(239, 246, 255);
          doc.roundedRect(margin, currentY, pageWidth - 2 * margin, 10, 2, 2, "F");
          doc.setFillColor(59, 130, 246);
          doc.rect(margin, currentY, 3, 10, "F");
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 64, 175);
          doc.text("Expense Requests", margin + 8, currentY + 7);
          currentY += 14;

          // Helper to get recipient info like in ExpenseList
          const getRecipientInfo = (expense: ExpenseRequestWithRelations) => {
            const isDifferent = expense.is_different_recipient;
            return {
              name: isDifferent && expense.recipient_name ? expense.recipient_name : expense.requester_name,
              phone: isDifferent && expense.recipient_phone ? expense.recipient_phone : expense.requester_phone,
              email: isDifferent && expense.recipient_email ? expense.recipient_email : expense.requester_email,
              isDifferent,
            };
          };

          const recentExpenses = expenses
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            )
            .slice(0, 10)
            .map((expense) => {
              const attachments = expense.attachments as unknown as AttachmentData[] | undefined;
              const attachmentCount = attachments?.length || 0;
              const recipient = getRecipientInfo(expense);
              return [
                new Date(expense.created_at).toLocaleDateString(),
                expense.title.substring(0, 20) +
                  (expense.title.length > 20 ? "..." : ""),
                `$${expense.amount.toLocaleString()}`,
                REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type] || expense.reimbursement_type,
                expense.tin || "-",
                expense.is_advance_payment ? "Yes" : "No",
                recipient.name ? recipient.name.substring(0, 12) + (recipient.name.length > 12 ? "..." : "") : "-",
                recipient.phone || "-",
                recipient.email ? recipient.email.substring(0, 15) + (recipient.email.length > 15 ? "..." : "") : "-",
                expense.status
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (l) => l.toUpperCase()),
                attachmentCount > 0 ? `${attachmentCount}` : '-',
              ];
            });

          autoTable(doc, {
            startY: currentY,
            head: [["Date", "Justification", "Amount", "Reimb.", "TIN", "Adv.", "Recipient", "Phone", "Email", "Status", "Files"]],
            body: recentExpenses,
            theme: "plain",
            headStyles: {
              fillColor: [30, 64, 175],
              textColor: [255, 255, 255],
              fontStyle: "bold",
              fontSize: 7,
              cellPadding: 2,
            },
            bodyStyles: {
              fontSize: 7,
              cellPadding: 2,
            },
            alternateRowStyles: {
              fillColor: [248, 250, 252],
            },
            columnStyles: {
              0: { cellWidth: 16 },
              1: { cellWidth: 28 },
              2: { cellWidth: 16, halign: "right" },
              3: { cellWidth: 14 },
              4: { cellWidth: 18 },
              5: { cellWidth: 10 },
              6: { cellWidth: 20 },
              7: { cellWidth: 20 },
              8: { cellWidth: 24 },
              9: { cellWidth: 18 },
              10: { cellWidth: 10 },
            },
            tableWidth: "auto",
            margin: { left: margin, right: margin },
            didParseCell: (data) => {
              // Style status column based on value
              if (data.column.index === 9 && data.section === "body") {
                const status = String(data.cell.raw).toLowerCase();
                if (status.includes("approved") || status.includes("completed")) {
                  data.cell.styles.textColor = [5, 150, 105];
                  data.cell.styles.fontStyle = "bold";
                } else if (status.includes("pending")) {
                  data.cell.styles.textColor = [217, 119, 6];
                } else if (status.includes("denied") || status.includes("rejected")) {
                  data.cell.styles.textColor = [220, 38, 38];
                }
              }
            },
          });

          const docWithTable = doc as jsPDF & {
            lastAutoTable?: { finalY: number };
          };
          currentY = (docWithTable.lastAutoTable?.finalY || currentY) + 15;
        }

        if (allocations.length > 0) {
          if (currentY > pageHeight - 80) {
            doc.addPage();
            currentY = 20;
          }

          // Allocation section header
          doc.setFillColor(243, 232, 255);
          doc.roundedRect(margin, currentY, pageWidth - 2 * margin, 10, 2, 2, "F");
          doc.setFillColor(139, 92, 246);
          doc.rect(margin, currentY, 3, 10, "F");
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(109, 40, 217);
          doc.text("Budget Requests", margin + 8, currentY + 7);
          currentY += 14;

          const recentAllocations = allocations
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            )
            .slice(0, 10)
            .map((allocation) => [
              new Date(allocation.created_at).toLocaleDateString(),
              (allocation.justification || "").substring(0, 30) +
                ((allocation.justification || "").length > 30 ? "..." : ""),
              `$${allocation.requested_amount.toLocaleString()}`,
              allocation.approved_amount
                ? `$${allocation.approved_amount.toLocaleString()}`
                : "N/A",
              allocation.status
                .replace(/_/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase()),
            ]);

          autoTable(doc, {
            startY: currentY,
            head: [["Date", "Justification", "Requested", "Approved", "Status"]],
            body: recentAllocations,
            theme: "plain",
            headStyles: {
              fillColor: [109, 40, 217],
              textColor: [255, 255, 255],
              fontStyle: "bold",
              fontSize: 9,
              cellPadding: 4,
            },
            bodyStyles: {
              fontSize: 9,
              cellPadding: 4,
            },
            alternateRowStyles: {
              fillColor: [250, 245, 255],
            },
            tableWidth: "auto",
            margin: { left: margin, right: margin },
            didParseCell: (data) => {
              // Style status column based on value
              if (data.column.index === 4 && data.section === "body") {
                const status = String(data.cell.raw).toLowerCase();
                if (status.includes("approved")) {
                  data.cell.styles.textColor = [5, 150, 105];
                  data.cell.styles.fontStyle = "bold";
                } else if (status.includes("pending")) {
                  data.cell.styles.textColor = [217, 119, 6];
                } else if (status.includes("denied") || status.includes("rejected")) {
                  data.cell.styles.textColor = [220, 38, 38];
                }
              }
            },
          });
        }
      }

      // Attachments Section - Add all expense attachments
      const expensesWithAttachments = expenses.filter((expense) => {
        const attachments = expense.attachments as unknown as AttachmentData[] | undefined;
        return attachments && attachments.length > 0;
      });

      if (expensesWithAttachments.length > 0) {
        doc.addPage();
        currentY = 20;

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Expense Attachments", margin, currentY);
        currentY += 15;

        for (const expense of expensesWithAttachments) {
          const attachments = expense.attachments as unknown as AttachmentData[] | undefined;
          if (!attachments || attachments.length === 0) continue;

          // Check if we need a new page
          if (currentY > pageHeight - 100) {
            doc.addPage();
            currentY = 20;
          }

          // Expense header
          doc.setFillColor(239, 246, 255);
          doc.rect(margin, currentY - 5, pageWidth - 2 * margin, 20, "F");

          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(30, 64, 175);
          doc.text(expense.title, margin + 5, currentY + 5);

          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(100, 100, 100);
          doc.text(
            `$${expense.amount.toLocaleString()} • ${new Date(expense.created_at).toLocaleDateString()}`,
            margin + 5,
            currentY + 12
          );
          currentY += 25;

          // Process each attachment
          for (const attachment of attachments) {
            try {
              // Get signed URL for the attachment
              let filePath = attachment.url || attachment.id;
              if (filePath.includes("supabase.co/storage")) {
                const match = filePath.match(/expense-attachments\/(.+)$/);
                if (match) {
                  filePath = match[1];
                }
              }

              const { data: signedUrlData } = await supabase.storage
                .from("expense-attachments")
                .createSignedUrl(filePath, 3600);

              if (signedUrlData?.signedUrl) {
                const isImage = attachment.type.startsWith("image/");

                if (isImage) {
                  // Check if we need a new page for the image
                  if (currentY > pageHeight - 120) {
                    doc.addPage();
                    currentY = 20;
                  }

                  try {
                    // Load and add image to PDF
                    const img = await loadImage(signedUrlData.signedUrl);

                    // Calculate dimensions to fit within page width while maintaining aspect ratio
                    const maxWidth = pageWidth - 2 * margin - 20;
                    const maxHeight = 100;
                    let imgWidth = img.width;
                    let imgHeight = img.height;

                    if (imgWidth > maxWidth) {
                      const ratio = maxWidth / imgWidth;
                      imgWidth = maxWidth;
                      imgHeight = imgHeight * ratio;
                    }
                    if (imgHeight > maxHeight) {
                      const ratio = maxHeight / imgHeight;
                      imgHeight = maxHeight;
                      imgWidth = imgWidth * ratio;
                    }

                    // Add attachment name
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(60, 60, 60);
                    doc.text(`📎 ${attachment.name}`, margin + 5, currentY);
                    currentY += 5;

                    // Add the image
                    doc.addImage(img, "JPEG", margin + 5, currentY, imgWidth, imgHeight);
                    currentY += imgHeight + 15;
                  } catch (imgError) {
                    // If image fails to load, just show the filename
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "normal");
                    doc.setTextColor(60, 60, 60);
                    doc.text(`📎 ${attachment.name} (image could not be loaded)`, margin + 5, currentY);
                    currentY += 10;
                  }
                } else {
                  // Non-image attachment - just list the filename
                  doc.setFontSize(9);
                  doc.setFont("helvetica", "normal");
                  doc.setTextColor(60, 60, 60);
                  const fileSize = attachment.size < 1024 * 1024
                    ? `${(attachment.size / 1024).toFixed(1)} KB`
                    : `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`;
                  doc.text(`📄 ${attachment.name} (${fileSize})`, margin + 5, currentY);
                  currentY += 10;
                }
              }
            } catch (error) {
              console.error("Error processing attachment:", error);
              doc.setFontSize(9);
              doc.setTextColor(150, 150, 150);
              doc.text(`📎 ${attachment.name} (unavailable)`, margin + 5, currentY);
              currentY += 10;
            }
          }

          currentY += 10; // Space between expenses
        }
      }

      // Footer on all pages
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);

        // Page number
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 8, {
          align: "center",
        });

        // Organization name
        doc.text(organizationName, margin, pageHeight - 8);

        // Generation date
        doc.text(
          `Generated: ${new Date().toLocaleDateString()}`,
          pageWidth - margin,
          pageHeight - 8,
          { align: "right" }
        );
      }

      // Open PDF in new tab instead of downloading
      const fileName = `${ministryName.replace(/ /g, "_")}_Budget_Report_${
        new Date().toISOString().split("T")[0]
      }.pdf`;

      // Create blob URL and open in new tab
      const pdfBlob = doc.output("blob");
      const blobUrl = URL.createObjectURL(pdfBlob);
      window.open(blobUrl, "_blank");

      // Clean up the blob URL after a short delay
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const exportToExcel = () => {
    const stats = calculateStats();

    // Helper to escape XML special characters
    const escapeXML = (str: string | number | null | undefined): string => {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    };

    // Helper to get recipient info
    const getRecipientInfo = (expense: ExpenseRequestWithRelations) => {
      const isDifferent = expense.is_different_recipient;
      return {
        name: isDifferent && expense.recipient_name ? expense.recipient_name : expense.requester_name,
        phone: isDifferent && expense.recipient_phone ? expense.recipient_phone : expense.requester_phone,
        email: isDifferent && expense.recipient_email ? expense.recipient_email : expense.requester_email,
      };
    };

    // Build expense rows
    const expenseRows = expenses.map((expense) => {
      const attachments = expense.attachments as unknown as AttachmentData[] | undefined;
      const attachmentCount = attachments?.length || 0;
      const recipient = getRecipientInfo(expense);
      const statusLabel = expense.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      return `
        <Row>
          <Cell><Data ss:Type="String">${escapeXML(new Date(expense.created_at).toLocaleDateString())}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(expense.title)}</Data></Cell>
          <Cell ss:StyleID="Currency"><Data ss:Type="Number">${expense.amount}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type] || expense.reimbursement_type)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(expense.tin || "-")}</Data></Cell>
          <Cell><Data ss:Type="String">${expense.is_advance_payment ? "Yes" : "No"}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(recipient.name || "-")}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(recipient.phone || "-")}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(recipient.email || "-")}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(statusLabel)}</Data></Cell>
          <Cell><Data ss:Type="Number">${attachmentCount}</Data></Cell>
        </Row>`;
    }).join("");

    // Build allocation rows
    const allocationRows = allocations.map((allocation) => {
      const statusLabel = allocation.status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      return `
        <Row>
          <Cell><Data ss:Type="String">${escapeXML(new Date(allocation.created_at).toLocaleDateString())}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(allocation.justification || "-")}</Data></Cell>
          <Cell ss:StyleID="Currency"><Data ss:Type="Number">${allocation.requested_amount}</Data></Cell>
          <Cell ss:StyleID="Currency"><Data ss:Type="Number">${allocation.approved_amount || 0}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(statusLabel)}</Data></Cell>
          <Cell><Data ss:Type="String">${escapeXML(allocation.fiscal_year?.name || "-")}</Data></Cell>
        </Row>`;
    }).join("");

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">

  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Title>${escapeXML(ministryName)} Budget Report</Title>
    <Author>${escapeXML(userName)}</Author>
    <Company>${escapeXML(organizationName)}</Company>
    <Created>${new Date().toISOString()}</Created>
  </DocumentProperties>

  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="11"/>
    </Style>
    <Style ss:ID="Title">
      <Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#1E40AF"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="Subtitle">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#64748B"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="SectionHeader">
      <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#1E40AF"/>
      <Alignment ss:Vertical="Center"/>
      <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="TableHeader">
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Interior ss:Color="#1E40AF" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#1E40AF"/>
      </Borders>
    </Style>
    <Style ss:ID="TableHeaderViolet">
      <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
      <Interior ss:Color="#6D28D9" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="SummaryLabel">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#475569"/>
      <Alignment ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="SummaryValue">
      <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#0F172A"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="SummaryTotal">
      <Font ss:FontName="Calibri" ss:Size="12" ss:Bold="1" ss:Color="#059669"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Interior ss:Color="#ECFDF5" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="Currency">
      <NumberFormat ss:Format="&quot;$&quot;#,##0.00"/>
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
    </Style>
    <Style ss:ID="DataRow">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
    </Style>
    <Style ss:ID="DataRowAlt">
      <Alignment ss:Vertical="Center"/>
      <Font ss:FontName="Calibri" ss:Size="10"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
    </Style>
  </Styles>

  <!-- Summary Sheet -->
  <Worksheet ss:Name="Summary">
    <Table ss:DefaultColumnWidth="100">
      <Column ss:Width="200"/>
      <Column ss:Width="150"/>

      <Row ss:Height="30">
        <Cell ss:StyleID="Title"><Data ss:Type="String">${escapeXML(ministryName)} Budget Report</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="Subtitle"><Data ss:Type="String">${escapeXML(organizationName)}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="Subtitle"><Data ss:Type="String">Submitted by: ${escapeXML(userName)}</Data></Cell>
      </Row>
      ${fiscalYearName ? `<Row><Cell ss:StyleID="Subtitle"><Data ss:Type="String">Fiscal Year: ${escapeXML(fiscalYearName)}</Data></Cell></Row>` : ""}
      <Row>
        <Cell ss:StyleID="Subtitle"><Data ss:Type="String">Generated: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</Data></Cell>
      </Row>
      <Row></Row>

      <Row ss:Height="25">
        <Cell ss:StyleID="SectionHeader" ss:MergeAcross="1"><Data ss:Type="String">Overall Summary</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Total Budget Activity</Data></Cell>
        <Cell ss:StyleID="SummaryTotal"><Data ss:Type="String">$${stats.combined.total.toLocaleString()}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Total Approved</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">$${stats.combined.approved.toLocaleString()}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Total Pending</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">$${stats.combined.pending.toLocaleString()}</Data></Cell>
      </Row>
      <Row></Row>

      <Row ss:Height="25">
        <Cell ss:StyleID="SectionHeader" ss:MergeAcross="1"><Data ss:Type="String">Expense Summary</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Total Requests</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="Number">${stats.expenses.count}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Total Amount</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">$${stats.expenses.total.toLocaleString()}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Approved Amount</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">$${stats.expenses.approved.toLocaleString()}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Pending Amount</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">$${stats.expenses.pending.toLocaleString()}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Approval Rate</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">${stats.expenses.approvalRate}%</Data></Cell>
      </Row>
      <Row></Row>

      <Row ss:Height="25">
        <Cell ss:StyleID="SectionHeader" ss:MergeAcross="1"><Data ss:Type="String">Allocation Summary</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Total Requests</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="Number">${stats.allocations.count}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Total Requested</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">$${stats.allocations.total.toLocaleString()}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Approved Amount</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">$${stats.allocations.approved.toLocaleString()}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Pending Amount</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">$${stats.allocations.pending.toLocaleString()}</Data></Cell>
      </Row>
      <Row>
        <Cell ss:StyleID="SummaryLabel"><Data ss:Type="String">Approval Rate</Data></Cell>
        <Cell ss:StyleID="SummaryValue"><Data ss:Type="String">${stats.allocations.approvalRate}%</Data></Cell>
      </Row>
    </Table>
  </Worksheet>

  <!-- Expenses Sheet -->
  <Worksheet ss:Name="Expenses">
    <Table ss:DefaultColumnWidth="100">
      <Column ss:Width="85"/>
      <Column ss:Width="200"/>
      <Column ss:Width="90"/>
      <Column ss:Width="80"/>
      <Column ss:Width="100"/>
      <Column ss:Width="50"/>
      <Column ss:Width="120"/>
      <Column ss:Width="110"/>
      <Column ss:Width="150"/>
      <Column ss:Width="100"/>
      <Column ss:Width="50"/>

      <Row ss:StyleID="TableHeader" ss:Height="35">
        <Cell><Data ss:Type="String">Date</Data></Cell>
        <Cell><Data ss:Type="String">Justification</Data></Cell>
        <Cell><Data ss:Type="String">Amount</Data></Cell>
        <Cell><Data ss:Type="String">Reimb. Type</Data></Cell>
        <Cell><Data ss:Type="String">TIN</Data></Cell>
        <Cell><Data ss:Type="String">Adv.</Data></Cell>
        <Cell><Data ss:Type="String">Recipient</Data></Cell>
        <Cell><Data ss:Type="String">Phone</Data></Cell>
        <Cell><Data ss:Type="String">Email</Data></Cell>
        <Cell><Data ss:Type="String">Status</Data></Cell>
        <Cell><Data ss:Type="String">Files</Data></Cell>
      </Row>
      ${expenseRows}
    </Table>
  </Worksheet>

  <!-- Allocations Sheet -->
  <Worksheet ss:Name="Allocations">
    <Table ss:DefaultColumnWidth="100">
      <Column ss:Width="85"/>
      <Column ss:Width="300"/>
      <Column ss:Width="120"/>
      <Column ss:Width="120"/>
      <Column ss:Width="100"/>
      <Column ss:Width="80"/>

      <Row ss:StyleID="TableHeaderViolet" ss:Height="35">
        <Cell><Data ss:Type="String">Date</Data></Cell>
        <Cell><Data ss:Type="String">Justification</Data></Cell>
        <Cell><Data ss:Type="String">Requested</Data></Cell>
        <Cell><Data ss:Type="String">Approved</Data></Cell>
        <Cell><Data ss:Type="String">Status</Data></Cell>
        <Cell><Data ss:Type="String">Fiscal Year</Data></Cell>
      </Row>
      ${allocationRows}
    </Table>
  </Worksheet>
</Workbook>`;

    const blob = new Blob([xmlContent], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${ministryName.replace(/ /g, "_")}_Budget_Report_${
        new Date().toISOString().split("T")[0]
      }.xls`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print the report");
      return;
    }

    const stats = calculateStats();
    const chartData = prepareChartData();
    const approvalRate = stats.expenses.count + stats.allocations.count > 0
      ? (((expenses.filter((e) => ["treasury_approved", "leader_approved", "completed"].includes(e.status)).length +
          allocations.filter((a) => a.status === "approved").length) /
          (stats.expenses.count + stats.allocations.count)) * 100).toFixed(0)
      : "0";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${ministryName} Budget Report</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              padding: 0;
              max-width: 1100px;
              margin: 0 auto;
              background: white;
              color: #1e293b;
            }
            .header {
              background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
              color: white;
              padding: 30px 40px;
              margin-bottom: 0;
              position: relative;
              overflow: hidden;
            }
            .header::before {
              content: '';
              position: absolute;
              top: 0;
              right: 0;
              width: 300px;
              height: 100%;
              background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 100%);
            }
            .header-content {
              display: flex;
              align-items: center;
              gap: 24px;
              position: relative;
              z-index: 1;
            }
            .header img {
              width: 70px;
              height: 70px;
              border-radius: 12px;
              background: white;
              padding: 4px;
            }
            .logo-placeholder {
              width: 70px;
              height: 70px;
              border-radius: 12px;
              background: rgba(255,255,255,0.2);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 28px;
              font-weight: bold;
            }
            .header-text h1 {
              color: white;
              font-size: 26px;
              margin-bottom: 6px;
              font-weight: 700;
            }
            .header-text p {
              color: rgba(255,255,255,0.85);
              font-size: 13px;
              margin: 3px 0;
            }
            .header-text p strong {
              color: white;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 0;
              margin: 0;
            }
            .summary-card {
              color: white;
              padding: 24px 28px;
              position: relative;
              overflow: hidden;
            }
            .summary-card::after {
              content: '';
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              height: 3px;
              background: rgba(0,0,0,0.1);
            }
            .summary-card.total {
              background: linear-gradient(135deg, #059669 0%, #10b981 100%);
            }
            .summary-card.approved {
              background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
            }
            .summary-card.pending {
              background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
            }
            .summary-card .label {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 1px;
              opacity: 0.9;
              margin-bottom: 8px;
              font-weight: 600;
            }
            .summary-card .value {
              font-size: 32px;
              font-weight: 800;
              margin-bottom: 4px;
              letter-spacing: -1px;
            }
            .summary-card .subvalue {
              font-size: 12px;
              opacity: 0.85;
            }
            .content {
              padding: 30px 40px;
            }
            .section-header {
              display: flex;
              align-items: center;
              gap: 12px;
              margin: 30px 0 16px 0;
              padding: 12px 16px;
              background: #f8fafc;
              border-radius: 8px;
              border-left: 4px solid #3b82f6;
            }
            .section-header.violet {
              border-left-color: #8b5cf6;
            }
            .section-header.emerald {
              border-left-color: #10b981;
            }
            .section-header h2 {
              color: #1e40af;
              font-size: 16px;
              font-weight: 700;
              margin: 0;
              flex: 1;
            }
            .section-header.violet h2 {
              color: #6d28d9;
            }
            .section-header.emerald h2 {
              color: #059669;
            }
            .section-header .count {
              font-size: 12px;
              color: #64748b;
              font-weight: 500;
            }
            table {
              width: 100%;
              border-collapse: separate;
              border-spacing: 0;
              margin: 0 0 20px 0;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            }
            th {
              background: #1e40af;
              color: white;
              font-weight: 600;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              padding: 14px 12px;
              text-align: left;
            }
            table.violet th {
              background: #6d28d9;
            }
            table.emerald th {
              background: #059669;
            }
            td {
              padding: 12px;
              text-align: left;
              font-size: 13px;
              border-bottom: 1px solid #e2e8f0;
            }
            tr:nth-child(even) {
              background-color: #f8fafc;
            }
            tr:last-child td {
              border-bottom: none;
            }
            .text-right {
              text-align: right;
            }
            .amount {
              font-weight: 600;
              font-family: 'SF Mono', Monaco, monospace;
            }
            .status-badge {
              display: inline-block;
              padding: 4px 10px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 600;
            }
            .status-approved {
              background: #dcfce7;
              color: #166534;
            }
            .status-pending {
              background: #fef3c7;
              color: #92400e;
            }
            .status-rejected {
              background: #fee2e2;
              color: #991b1b;
            }
            .metrics-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 16px;
              margin: 16px 0;
            }
            .metric-box {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              padding: 16px;
            }
            .metric-box h4 {
              color: #1e40af;
              font-size: 13px;
              margin-bottom: 12px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .metric-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #e2e8f0;
            }
            .metric-row:last-child {
              border-bottom: none;
            }
            .metric-label {
              color: #64748b;
              font-size: 13px;
            }
            .metric-value {
              font-weight: 600;
              color: #0f172a;
              font-size: 13px;
            }
            .footer {
              margin-top: 40px;
              padding: 20px 40px;
              background: #f8fafc;
              text-align: center;
              color: #64748b;
              font-size: 11px;
              border-top: 1px solid #e2e8f0;
            }
            .footer strong {
              color: #1e40af;
            }
            @media print {
              body {
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .header {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .summary-grid {
                page-break-inside: avoid;
              }
              table {
                page-break-inside: avoid;
              }
              .section-header {
                page-break-after: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-content">
              <img src="/church-logo.png" alt="Church Logo" onerror="this.parentElement.innerHTML='<div class=\\'logo-placeholder\\'>$</div>' + this.parentElement.innerHTML.replace(this.outerHTML, '')" />
              <div class="header-text">
                <h1>${ministryName} Budget Report</h1>
                <p><strong>${organizationName}</strong></p>
                <p>Submitted by: ${userName} ${fiscalYearName ? ` •  Fiscal Year: ${fiscalYearName}` : ""}</p>
                <p>Generated: ${new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}</p>
              </div>
            </div>
          </div>

          <div class="summary-grid">
            <div class="summary-card total">
              <div class="label">Total Budget</div>
              <div class="value">$${stats.combined.total.toLocaleString()}</div>
              <div class="subvalue">${stats.expenses.count + stats.allocations.count} total requests</div>
            </div>
            <div class="summary-card approved">
              <div class="label">Approved</div>
              <div class="value">$${stats.combined.approved.toLocaleString()}</div>
              <div class="subvalue">${approvalRate}% approval rate</div>
            </div>
            <div class="summary-card pending">
              <div class="label">Pending</div>
              <div class="value">$${stats.combined.pending.toLocaleString()}</div>
              <div class="subvalue">awaiting review</div>
            </div>
          </div>

          <div class="content">

          ${
            expenses.length > 0
              ? `
            <div class="section-header">
              <h2>Expense Requests</h2>
              <span class="count">${stats.expenses.count} requests  •  $${stats.expenses.total.toLocaleString()} total</span>
            </div>
            <div class="metrics-grid">
              <div class="metric-box">
                <h4>Expense Summary</h4>
                <div class="metric-row">
                  <span class="metric-label">Total Requests</span>
                  <span class="metric-value">${stats.expenses.count}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Total Amount</span>
                  <span class="metric-value">$${stats.expenses.total.toLocaleString()}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Approved</span>
                  <span class="metric-value">$${stats.expenses.approved.toLocaleString()}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Pending</span>
                  <span class="metric-value">$${stats.expenses.pending.toLocaleString()}</span>
                </div>
              </div>
              <div class="metric-box">
                <h4>Status Breakdown</h4>
                ${chartData.expenseChartData
                  .map(
                    (item) => `
                  <div class="metric-row">
                    <span class="metric-label">${item.name}</span>
                    <span class="metric-value">${
                      item.count
                    } ($${item.value.toLocaleString()})</span>
                  </div>
                `
                  )
                  .join("")}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Justification</th>
                  <th class="text-right">Amount</th>
                  <th>Reimb.</th>
                  <th>TIN</th>
                  <th>Adv.</th>
                  <th>Recipient</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Files</th>
                </tr>
              </thead>
              <tbody>
                ${expenses
                  .sort(
                    (a, b) =>
                      new Date(b.created_at).getTime() -
                      new Date(a.created_at).getTime()
                  )
                  .slice(0, 15)
                  .map(
                    (expense) => {
                      const attachments = expense.attachments as unknown as AttachmentData[] | undefined;
                      const attachmentCount = attachments?.length || 0;
                      const reimbLabel = REIMBURSEMENT_TYPE_LABELS[expense.reimbursement_type] || expense.reimbursement_type;
                      // Helper to get recipient info like in ExpenseList
                      const isDifferent = expense.is_different_recipient;
                      const recipientName = isDifferent && expense.recipient_name ? expense.recipient_name : expense.requester_name;
                      const recipientPhone = isDifferent && expense.recipient_phone ? expense.recipient_phone : expense.requester_phone;
                      const recipientEmail = isDifferent && expense.recipient_email ? expense.recipient_email : expense.requester_email;
                      return `
                    <tr>
                      <td>${new Date(
                        expense.created_at
                      ).toLocaleDateString()}</td>
                      <td>${expense.title}</td>
                      <td class="text-right amount">$${expense.amount.toLocaleString()}</td>
                      <td>${reimbLabel}</td>
                      <td>${expense.tin || "-"}</td>
                      <td>${expense.is_advance_payment ? "Yes" : "No"}</td>
                      <td>${recipientName || "-"}</td>
                      <td>${recipientPhone || "-"}</td>
                      <td>${recipientEmail || "-"}</td>
                      <td><span class="status-badge status-${
                        [
                          "treasury_approved",
                          "leader_approved",
                          "completed",
                        ].includes(expense.status)
                          ? "approved"
                          : [
                              "leader_denied",
                              "treasury_denied",
                              "cancelled",
                            ].includes(expense.status)
                          ? "rejected"
                          : "pending"
                      }">${expense.status
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}</span></td>
                      <td>${attachmentCount > 0 ? `${attachmentCount}` : '-'}</td>
                    </tr>
                  `;
                    }
                  )
                  .join("")}
              </tbody>
            </table>
          `
              : ""
          }

          ${
            allocations.length > 0
              ? `
            <div class="section-header violet">
              <h2>Budget Requests</h2>
              <span class="count">${stats.allocations.count} requests  •  $${stats.allocations.total.toLocaleString()} total</span>
            </div>
            <div class="metrics-grid">
              <div class="metric-box">
                <h4>Allocation Summary</h4>
                <div class="metric-row">
                  <span class="metric-label">Total Requests</span>
                  <span class="metric-value">${stats.allocations.count}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Total Requested</span>
                  <span class="metric-value">$${stats.allocations.total.toLocaleString()}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Approved</span>
                  <span class="metric-value">$${stats.allocations.approved.toLocaleString()}</span>
                </div>
                <div class="metric-row">
                  <span class="metric-label">Pending</span>
                  <span class="metric-value">$${stats.allocations.pending.toLocaleString()}</span>
                </div>
              </div>
              <div class="metric-box">
                <h4>Status Breakdown</h4>
                ${chartData.allocationChartData
                  .map(
                    (item) => `
                  <div class="metric-row">
                    <span class="metric-label">${item.name}</span>
                    <span class="metric-value">${
                      item.count
                    } ($${item.value.toLocaleString()})</span>
                  </div>
                `
                  )
                  .join("")}
              </div>
            </div>

            <table class="violet">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Justification</th>
                  <th class="text-right">Requested</th>
                  <th class="text-right">Approved</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${allocations
                  .sort(
                    (a, b) =>
                      new Date(b.created_at).getTime() -
                      new Date(a.created_at).getTime()
                  )
                  .slice(0, 15)
                  .map(
                    (allocation) => `
                    <tr>
                      <td>${new Date(
                        allocation.created_at
                      ).toLocaleDateString()}</td>
                      <td>${allocation.justification || "N/A"}</td>
                      <td class="text-right amount">$${allocation.requested_amount.toLocaleString()}</td>
                      <td class="text-right amount">${
                        allocation.approved_amount
                          ? `$${allocation.approved_amount.toLocaleString()}`
                          : "N/A"
                      }</td>
                      <td><span class="status-badge status-${
                        allocation.status === "approved" ||
                        allocation.status === "partially_approved"
                          ? "approved"
                          : ["denied", "cancelled"].includes(allocation.status)
                          ? "rejected"
                          : "pending"
                      }">${allocation.status
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}</span></td>
                    </tr>
                  `
                  )
                  .join("")}
              </tbody>
            </table>
          `
              : ""
          }

          ${
            chartData.ministryChartData.length > 0
              ? `
            <div class="section-header emerald">
              <h2>Top Ministries by Budget Activity</h2>
            </div>
            <table class="emerald">
              <thead>
                <tr>
                  <th>Ministry</th>
                  <th class="text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                ${chartData.ministryChartData
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.name}</td>
                    <td class="text-right amount">$${item.value.toLocaleString()}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          `
              : ""
          }

          </div>

          <div class="footer">
            <p><strong>${organizationName}</strong> — Budget Report</p>
            <p>Generated on ${new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}</p>
          </div>

          <script>
            window.onload = function() {
              setTimeout(() => window.print(), 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isGenerating}>
            <Download className="mr-2 h-4 w-4" />
            {isGenerating ? "Generating..." : "Export Report"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={generateEnhancedPDF}
            disabled={isGenerating}
          >
            <FileText className="mr-2 h-4 w-4" />
            Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportToExcel}>
            <FileText className="mr-2 h-4 w-4" />
            Export as Excel
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={printReport}>
            <Printer className="mr-2 h-4 w-4" />
            Print Report
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden charts container for capturing (future enhancement) */}
      <div
        ref={chartsRef}
        style={{ position: "absolute", left: "-9999px", top: 0 }}
      />
    </>
  );
};
