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
} from "../types";
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

      // Add church logo
      try {
        const logoImg = await loadImage("/church-logo.png");
        doc.addImage(logoImg, "PNG", margin, 10, 25, 25);
      } catch (error) {
        console.log("Logo not loaded, continuing without it");
      }

      // Header
      doc.setFontSize(24);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 58, 138); // Blue-900
      doc.text(`${ministryName} Budget Report`, 45, 20);

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`${organizationName}`, 45, 28);
      doc.text(`Submitted by: ${userName}`, 45, 35);
      if (fiscalYearName) {
        doc.text(`Fiscal Year: ${fiscalYearName}`, 45, 42);
      }
      doc.text(
        `Generated: ${new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}`,
        45,
        fiscalYearName ? 49 : 42
      );

      currentY = fiscalYearName ? 60 : 53;

      // Executive Summary Section
      doc.setFillColor(239, 246, 255); // Blue-50
      doc.rect(margin, currentY, pageWidth - 2 * margin, 50, "F");

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175); // Blue-800
      doc.text("Executive Summary", margin + 5, currentY + 8);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);

      const summaryItems = [
        {
          label: "Total Budget Activity:",
          value: `$${stats.combined.total.toLocaleString()}`,
          x: margin + 5,
          y: currentY + 18,
        },
        {
          label: "Total Approved:",
          value: `$${stats.combined.approved.toLocaleString()}`,
          x: margin + 5,
          y: currentY + 26,
        },
        {
          label: "Total Pending:",
          value: `$${stats.combined.pending.toLocaleString()}`,
          x: margin + 5,
          y: currentY + 34,
        },
        {
          label: "Expense Requests:",
          value: `${
            stats.expenses.count
          } ($${stats.expenses.total.toLocaleString()})`,
          x: pageWidth / 2 + 5,
          y: currentY + 18,
        },
        {
          label: "Allocation Requests:",
          value: `${
            stats.allocations.count
          } ($${stats.allocations.total.toLocaleString()})`,
          x: pageWidth / 2 + 5,
          y: currentY + 26,
        },
        {
          label: "Overall Approval Rate:",
          value: `${
            stats.expenses.count + stats.allocations.count > 0
              ? (
                  ((expenses.filter((e) =>
                    [
                      "treasury_approved",
                      "leader_approved",
                      "completed",
                    ].includes(e.status)
                  ).length +
                    allocations.filter((a) => a.status === "approved").length) /
                    (stats.expenses.count + stats.allocations.count)) *
                  100
                ).toFixed(1)
              : 0
          }%`,
          x: pageWidth / 2 + 5,
          y: currentY + 34,
        },
      ];

      summaryItems.forEach((item) => {
        doc.setFont("helvetica", "bold");
        doc.text(item.label, item.x, item.y);
        doc.setFont("helvetica", "normal");
        const labelWidth = doc.getTextWidth(item.label);
        doc.text(item.value, item.x + labelWidth + 5, item.y);
      });

      currentY += 60;

      // Expense Details Section
      if (expenses.length > 0) {
        // Check if we need a new page
        if (currentY > pageHeight - 100) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Expense Analysis", margin, currentY);
        currentY += 8;

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
          theme: "striped",
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          bodyStyles: {
            fontSize: 10,
          },
          tableWidth: "auto",
          margin: { left: margin, right: margin },
          didParseCell: (data) => {
            // Style the TOTAL row
            if (data.row.index === expenseStatusBreakdown.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [239, 246, 255];
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

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Budget Allocation Analysis", margin, currentY);
        currentY += 8;

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
          theme: "striped",
          headStyles: {
            fillColor: [139, 92, 246],
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          bodyStyles: {
            fontSize: 10,
          },
          tableWidth: "auto",
          margin: { left: margin, right: margin },
          didParseCell: (data) => {
            // Style the TOTAL row
            if (data.row.index === allocationStatusBreakdown.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [243, 232, 255];
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

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Top Ministries by Budget Activity", margin, currentY);
        currentY += 8;

        const ministryTableData = chartData.ministryChartData.map((item) => [
          item.name,
          `$${item.value.toLocaleString()}`,
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [["Ministry", "Total Amount"]],
          body: ministryTableData,
          theme: "striped",
          headStyles: {
            fillColor: [16, 185, 129],
            textColor: [255, 255, 255],
            fontStyle: "bold",
          },
          bodyStyles: {
            fontSize: 10,
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

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 64, 175);
        doc.text("Recent Transactions", margin, currentY);
        currentY += 15;

        if (expenses.length > 0) {
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(60, 60, 60);
          doc.text("Expense Requests", margin, currentY);
          currentY += 5;

          const recentExpenses = expenses
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            )
            .slice(0, 10)
            .map((expense) => [
              new Date(expense.created_at).toLocaleDateString(),
              expense.title.substring(0, 30) +
                (expense.title.length > 30 ? "..." : ""),
              (expense.description || "").substring(0, 30) +
                ((expense.description || "").length > 30 ? "..." : ""),
              `$${expense.amount.toLocaleString()}`,
              expense.status
                .replace(/_/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase()),
            ]);

          autoTable(doc, {
            startY: currentY,
            head: [["Date", "Justification", "Description", "Amount", "Status"]],
            body: recentExpenses,
            theme: "striped",
            headStyles: {
              fillColor: [59, 130, 246],
              textColor: [255, 255, 255],
              fontStyle: "bold",
            },
            tableWidth: "auto",
            margin: { left: margin, right: margin },
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

          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(60, 60, 60);
          doc.text("Budget Allocation Requests", margin, currentY);
          currentY += 5;

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
            theme: "striped",
            headStyles: {
              fillColor: [139, 92, 246],
              textColor: [255, 255, 255],
              fontStyle: "bold",
            },
            tableWidth: "auto",
            margin: { left: margin, right: margin },
          });
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

  const exportToCSV = () => {
    const stats = calculateStats();

    const rows = [
      [`${ministryName} Budget Report`],
      ["Organization:", organizationName],
      ["Submitted by:", userName],
      ...(fiscalYearName ? [["Fiscal Year:", fiscalYearName]] : []),
      ["Generated:", new Date().toLocaleDateString()],
      [],
      ["SUMMARY"],
      ["Total Budget Activity", `$${stats.combined.total}`],
      ["Total Approved", `$${stats.combined.approved}`],
      ["Total Pending", `$${stats.combined.pending}`],
      [],
      ["EXPENSES"],
      ["Total Expense Requests", stats.expenses.count],
      ["Total Expense Amount", `$${stats.expenses.total}`],
      ["Approved Expense Amount", `$${stats.expenses.approved}`],
      ["Pending Expense Amount", `$${stats.expenses.pending}`],
      ["Expense Approval Rate", `${stats.expenses.approvalRate}%`],
      [],
      ["ALLOCATIONS"],
      ["Total Allocation Requests", stats.allocations.count],
      ["Total Allocation Amount", `$${stats.allocations.total}`],
      ["Approved Allocation Amount", `$${stats.allocations.approved}`],
      ["Pending Allocation Amount", `$${stats.allocations.pending}`],
      ["Allocation Approval Rate", `${stats.allocations.approvalRate}%`],
      [],
      ["EXPENSE DETAILS"],
      ["Date", "Justification", "Description", "Amount", "Status", "Fiscal Year"],
      ...expenses.map((expense) => [
        new Date(expense.created_at).toLocaleDateString(),
        expense.title,
        expense.description || "N/A",
        expense.amount,
        expense.status,
        expense.fiscal_year?.name || "N/A",
      ]),
      [],
      ["ALLOCATION DETAILS"],
      [
        "Date",
        "Justification",
        "Requested Amount",
        "Approved Amount",
        "Status",
        "Fiscal Year",
      ],
      ...allocations.map((allocation) => [
        new Date(allocation.created_at).toLocaleDateString(),
        allocation.justification || "N/A",
        allocation.requested_amount,
        allocation.approved_amount || "N/A",
        allocation.status,
        allocation.fiscal_year?.name || "N/A",
      ]),
    ];

    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => {
            const cellStr = String(cell);
            // Escape quotes and wrap in quotes if contains comma
            return cellStr.includes(",") || cellStr.includes('"')
              ? `"${cellStr.replace(/"/g, '""')}"`
              : cellStr;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${ministryName.replace(/ /g, "_")}_Budget_Report_${
        new Date().toISOString().split("T")[0]
      }.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print the report");
      return;
    }

    const stats = calculateStats();
    const chartData = prepareChartData();

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
              font-family: 'Segoe UI', Arial, sans-serif;
              padding: 40px;
              max-width: 1200px;
              margin: 0 auto;
              background: white;
            }
            .header {
              display: flex;
              align-items: center;
              gap: 20px;
              padding-bottom: 20px;
              border-bottom: 3px solid #3b82f6;
              margin-bottom: 30px;
            }
            .header img {
              width: 80px;
              height: 80px;
            }
            .header-text h1 {
              color: #1e3a8a;
              font-size: 28px;
              margin-bottom: 5px;
            }
            .header-text p {
              color: #666;
              font-size: 14px;
              margin: 2px 0;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              margin: 30px 0;
            }
            .summary-card {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 20px;
              border-radius: 10px;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .summary-card.expenses {
              background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
            }
            .summary-card.allocations {
              background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
            }
            .summary-card.total {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            }
            .summary-card h3 {
              font-size: 14px;
              margin-bottom: 10px;
              opacity: 0.9;
            }
            .summary-card .value {
              font-size: 28px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .summary-card .subvalue {
              font-size: 12px;
              opacity: 0.8;
            }
            h2 {
              color: #1e40af;
              margin: 40px 0 20px 0;
              padding-bottom: 10px;
              border-bottom: 2px solid #e5e7eb;
              font-size: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            th, td {
              border: 1px solid #e5e7eb;
              padding: 12px;
              text-align: left;
            }
            th {
              background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
              color: white;
              font-weight: 600;
              font-size: 13px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            tr:nth-child(even) {
              background-color: #f9fafb;
            }
            tr:hover {
              background-color: #eff6ff;
            }
            .text-right {
              text-align: right;
            }
            .status-badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 600;
            }
            .status-approved {
              background: #d1fae5;
              color: #065f46;
            }
            .status-pending {
              background: #fed7aa;
              color: #92400e;
            }
            .status-rejected {
              background: #fee2e2;
              color: #991b1b;
            }
            .metrics-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 20px;
              margin: 20px 0;
            }
            .metric-box {
              background: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 15px;
            }
            .metric-box h4 {
              color: #374151;
              font-size: 14px;
              margin-bottom: 10px;
            }
            .metric-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .metric-row:last-child {
              border-bottom: none;
            }
            .metric-label {
              color: #6b7280;
              font-size: 13px;
            }
            .metric-value {
              font-weight: 600;
              color: #111827;
              font-size: 13px;
            }
            .footer {
              margin-top: 50px;
              padding-top: 20px;
              border-top: 2px solid #e5e7eb;
              text-align: center;
              color: #9ca3af;
              font-size: 12px;
            }
            @media print {
              body {
                padding: 20px;
              }
              .summary-grid {
                page-break-inside: avoid;
              }
              table {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="/church-logo.png" alt="Church Logo" onerror="this.style.display='none'" />
            <div class="header-text">
              <h1>${ministryName} Budget Report</h1>
              <p><strong>${organizationName}</strong></p>
              <p>Submitted by: ${userName}</p>
              ${fiscalYearName ? `<p>Fiscal Year: ${fiscalYearName}</p>` : ""}
              <p>Generated: ${new Date().toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}</p>
            </div>
          </div>

          <div class="summary-grid">
            <div class="summary-card expenses">
              <h3>Total Expenses</h3>
              <div class="value">$${stats.expenses.total.toLocaleString()}</div>
              <div class="subvalue">${stats.expenses.count} requests • ${
      stats.expenses.approvalRate
    }% approved</div>
            </div>
            <div class="summary-card allocations">
              <h3>Total Allocations</h3>
              <div class="value">$${stats.allocations.total.toLocaleString()}</div>
              <div class="subvalue">${stats.allocations.count} requests • ${
      stats.allocations.approvalRate
    }% approved</div>
            </div>
            <div class="summary-card total">
              <h3>Combined Budget Activity</h3>
              <div class="value">$${stats.combined.total.toLocaleString()}</div>
              <div class="subvalue">$${stats.combined.approved.toLocaleString()} approved • $${stats.combined.pending.toLocaleString()} pending</div>
            </div>
          </div>

          ${
            expenses.length > 0
              ? `
            <h2>Expense Analysis</h2>
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
                  <th>Description</th>
                  <th class="text-right">Amount</th>
                  <th>Status</th>
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
                    (expense) => `
                    <tr>
                      <td>${new Date(
                        expense.created_at
                      ).toLocaleDateString()}</td>
                      <td>${expense.title}</td>
                      <td>${expense.description || "N/A"}</td>
                      <td class="text-right">$${expense.amount.toLocaleString()}</td>
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
            allocations.length > 0
              ? `
            <h2>Budget Allocation Analysis</h2>
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

            <table>
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
                      <td class="text-right">$${allocation.requested_amount.toLocaleString()}</td>
                      <td class="text-right">${
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
            <h2>Top Ministries by Budget Activity</h2>
            <table>
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
                    <td class="text-right">$${item.value.toLocaleString()}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          `
              : ""
          }

          <div class="footer">
            <p><strong>${organizationName}</strong></p>
            <p>Generated on ${new Date().toLocaleDateString("en-US", {
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
          <DropdownMenuItem onClick={exportToCSV}>
            <FileText className="mr-2 h-4 w-4" />
            Export as CSV
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
