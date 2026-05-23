import React from "react";

const Modal = ({
  children,
}: Readonly<{
  children?: React.ReactNode;
}>) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      
      <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4">
        {children}
      </div>

    </div>
  );
};

export default Modal;
