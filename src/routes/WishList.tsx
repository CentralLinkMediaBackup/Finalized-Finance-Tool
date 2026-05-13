import { useState } from "react";
import { PageWrap } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, ExternalLink, MessageSquare } from "lucide-react";
import { useApp, type WishItem } from "@/contexts/AppContext";
import { fmt } from "@/lib/finance";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const BLANK: Omit<WishItem, "id" | "created_at"> = {
  name: "",
  estimatedPrice: 0,
  link: "",
  notes: "",
};

export default function WishList() {
  const { wishItems, addWishItem, updateWishItem, deleteWishItem } = useApp();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [editId, setEditId] = useState<string | null>(null);
  const navigate = useNavigate();

  const totalWishlist = wishItems.reduce((s, i) => s + i.estimatedPrice, 0);

  const setField = (k: keyof typeof BLANK, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.name.trim()) { toast.error("Enter an item name"); return; }
    if (editId) {
      updateWishItem(editId, form);
      toast.success("Updated");
      setEditId(null);
    } else {
      addWishItem(form);
      toast.success(`${form.name} added to wish list`);
    }
    setForm(BLANK);
    setAdding(false);
  };

  const startEdit = (item: WishItem) => {
    setForm({ name: item.name, estimatedPrice: item.estimatedPrice, link: item.link, notes: item.notes });
    setEditId(item.id);
    setAdding(true);
  };

  const askJarvis = (item: WishItem) => {
    const query = `Can I afford the ${item.name} (${fmt(item.estimatedPrice)})? If not now, when could I? Also check if a 4-payment Afterpay plan would work.`;
    sessionStorage.setItem("jarvis_prefill", query);
    navigate("/jarvis");
  };

  return (
    <PageWrap title="Wish List" subtitle="Track things you want — ask Jarvis if you can afford them">
      {wishItems.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm">
          <span className="text-muted-foreground">{wishItems.length} item{wishItems.length !== 1 ? "s" : ""} · total estimated</span>
          <span className="font-bold">{fmt(totalWishlist)}</span>
        </div>
      )}

      {/* Add / Edit form */}
      {adding && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="text-sm font-semibold">{editId ? "Edit Item" : "New Wish Item"}</div>
            <div className="space-y-1">
              <Label className="text-xs">Item Name</Label>
              <Input placeholder="e.g. Insta360 Camera AP1" value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Estimated Price</Label>
              <Input type="number" step="0.01" value={form.estimatedPrice || ""} onChange={(e) => setField("estimatedPrice", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Link (optional)</Label>
              <Input placeholder="https://..." value={form.link} onChange={(e) => setField("link", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input placeholder="Why you want it, any details..." value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={save} className="flex-1">{editId ? "Update" : "Add to List"}</Button>
              <Button variant="outline" onClick={() => { setAdding(false); setForm(BLANK); setEditId(null); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <div className="space-y-3">
        {wishItems.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-8">Nothing on your wish list yet. Add something!</p>
        )}
        {wishItems.map((item) => (
          <Card key={item.id}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-primary font-bold text-sm">{fmt(item.estimatedPrice)}</span>
                  </div>
                  {item.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => askJarvis(item)}>
                    <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}>
                    <span className="text-xs">✏️</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { deleteWishItem(item.id); toast.success("Removed"); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs h-7"
                  onClick={() => askJarvis(item)}
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  Ask Jarvis if I can afford this
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={() => { setAdding(true); setEditId(null); setForm(BLANK); }} className="w-full" variant="outline">
        <Plus className="h-4 w-4 mr-2" /> Add to Wish List
      </Button>
    </PageWrap>
  );
}
